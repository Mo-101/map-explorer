import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { neon } from "npm:@neondatabase/serverless@0.10.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SOURCE = "who_don";

const AFRICA_COUNTRIES = [
  "algeria","angola","benin","botswana","burkina faso","burundi","cabo verde","cameroon",
  "central african republic","chad","comoros","congo","côte d'ivoire","ivory coast",
  "democratic republic of the congo","djibouti","egypt","equatorial guinea","eritrea",
  "eswatini","ethiopia","gabon","gambia","ghana","guinea","guinea-bissau","kenya","lesotho",
  "liberia","libya","madagascar","malawi","mali","mauritania","mauritius","morocco",
  "mozambique","namibia","niger","nigeria","rwanda","sao tome and principe","senegal",
  "seychelles","sierra leone","somalia","south africa","south sudan","sudan","tanzania",
  "togo","tunisia","uganda","zambia","zimbabwe","africa","african",
];

function isAfricaRelated(text: string): boolean {
  const lower = text.toLowerCase();
  return AFRICA_COUNTRIES.some((c) => lower.includes(c));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const dbUrl = Deno.env.get("NEON_DATABASE_URL");
  if (!dbUrl) {
    return new Response(JSON.stringify({ error: "NEON_DATABASE_URL not set" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sql = neon(dbUrl);
  const runId = `who_don_${new Date().toISOString().slice(0, 13).replace(/[-T:]/g, "")}`;

  try {
    // ── Two-layer stale cleanup ──
    await sql`
      UPDATE hazard_alerts SET is_active = false, updated_at = NOW()
      WHERE source = ${SOURCE} AND is_active = true
        AND data_source_run_id IS NOT NULL AND data_source_run_id != ${runId}`;
    await sql`
      UPDATE hazard_alerts SET is_active = false, updated_at = NOW()
      WHERE source = ${SOURCE} AND is_active = true
        AND last_seen_at < NOW() - INTERVAL '72 hours'`;

    // ── Watermark ──
    const existing = await sql`
      SELECT 1 FROM hazard_alerts WHERE data_source_run_id = ${runId} AND source = ${SOURCE} LIMIT 1`;
    if (existing.length > 0) {
      return new Response(JSON.stringify({ status: "already_ingested", run_id: runId }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Try WHO JSON API first, fall back to RSS ──
    let items: Array<{ title: string; link: string; description: string; pubDate: string }> = [];
    let apiSource = "unknown";

    // Attempt 1: WHO JSON API
    try {
      const apiUrl = "https://www.who.int/api/news/diseaseoutbreaknews?sf_culture=en&$orderby=PublicationDateAndTime%20desc&$top=30";
      const resp = await fetch(apiUrl, {
        headers: { Accept: "application/json", "User-Agent": "AfroStorm/1.0 (health monitoring)" },
      });
      if (resp.ok) {
        const json = await resp.json();
        const records = json?.value || json?.Value || json?.items || json?.Items || [];
        if (Array.isArray(records) && records.length > 0) {
          apiSource = "who_json_api";
          for (const r of records) {
            items.push({
              title: r.Title || r.title || r.Name || "",
              link: r.UrlName ? `https://www.who.int/emergencies/disease-outbreak-news/${r.UrlName}` : (r.ItemDefaultUrl || r.Url || ""),
              description: r.Summary || r.summary || r.Description || "",
              pubDate: r.PublicationDateAndTime || r.DateCreated || "",
            });
          }
        }
      } else {
        console.warn(`[ingest-who-don] JSON API returned ${resp.status}, trying RSS`);
        await resp.text(); // consume
      }
    } catch (e) {
      console.warn("[ingest-who-don] JSON API failed:", e);
    }

    // Attempt 2: RSS feed fallback
    if (items.length === 0) {
      const rssUrls = [
        "https://www.who.int/feeds/entity/don/en/rss.xml",
        "https://www.who.int/rss-feeds/news/disease-outbreak-news.xml",
      ];
      for (const rssUrl of rssUrls) {
        try {
          const resp = await fetch(rssUrl, {
            headers: { Accept: "application/xml, text/xml, */*", "User-Agent": "AfroStorm/1.0" },
          });
          if (!resp.ok) { await resp.text(); continue; }
          const xml = await resp.text();
          const itemRegex = /<item>([\s\S]*?)<\/item>/g;
          let match;
          while ((match = itemRegex.exec(xml)) !== null) {
            const block = match[1];
            const get = (tag: string) => {
              const m = block.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\\/${tag}>`, "s"));
              return m ? m[1].trim() : "";
            };
            items.push({ title: get("title"), link: get("link"), description: get("description"), pubDate: get("pubDate") });
          }
          if (items.length > 0) { apiSource = "who_rss"; break; }
        } catch { /* try next URL */ }
      }
    }

    if (items.length === 0) {
      return new Response(JSON.stringify({
        status: "no_data", run_id: runId,
        message: "Could not fetch WHO DON from any endpoint",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let upsertCount = 0;
    let skipped = 0;

    for (const item of items) {
      const combined = `${item.title} ${item.description}`;
      if (!isAfricaRelated(combined)) { skipped++; continue; }

      const externalId = `who_don_${(item.link || item.title).replace(/[^a-zA-Z0-9]/g, "_").slice(-80)}`;

      await sql`
        INSERT INTO hazard_alerts (
          source, external_id, type, severity, title, description,
          lat, lng, is_active, data_source_run_id, last_seen_at,
          metadata, created_at, updated_at
        ) VALUES (
          ${SOURCE}, ${externalId}, 'epidemic', 'high', ${item.title.slice(0, 500)},
          ${item.description.slice(0, 2000)},
          0, 0, true, ${runId}, NOW(),
          ${JSON.stringify({ link: item.link, pub_date: item.pubDate, api_source: apiSource })}::jsonb,
          NOW(), NOW()
        )
        ON CONFLICT (source, external_id) DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          is_active = true,
          data_source_run_id = EXCLUDED.data_source_run_id,
          last_seen_at = NOW(),
          metadata = EXCLUDED.metadata,
          updated_at = NOW()`;
      upsertCount++;
    }

    console.log(`[ingest-who-don] ${apiSource}: upserted ${upsertCount}, skipped ${skipped} from ${items.length}`);

    return new Response(JSON.stringify({
      status: "ok", run_id: runId, api_source: apiSource,
      total_items: items.length, upserted: upsertCount, skipped_non_africa: skipped,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[ingest-who-don] Error:", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
