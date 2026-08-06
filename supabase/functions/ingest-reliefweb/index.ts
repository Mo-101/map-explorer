import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { neon } from "npm:@neondatabase/serverless@0.10.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SOURCE = "reliefweb";

// African country ISO3 codes
const AFRICA_ISO3 = [
  "DZA","AGO","BEN","BWA","BFA","BDI","CPV","CMR","CAF","TCD","COM","COG","COD",
  "CIV","DJI","EGY","GNQ","ERI","SWZ","ETH","GAB","GMB","GHA","GIN","GNB","KEN",
  "LSO","LBR","LBY","MDG","MWI","MLI","MRT","MUS","MAR","MOZ","NAM","NER","NGA",
  "RWA","STP","SEN","SYC","SLE","SOM","ZAF","SSD","SDN","TZA","TGO","TUN","UGA",
  "ZMB","ZWE",
];

const TYPE_MAP: Record<string, string> = {
  "Flood": "flood", "Flash Flood": "flood",
  "Tropical Cyclone": "cyclone", "Storm Surge": "cyclone",
  "Earthquake": "earthquake",
  "Volcano": "volcano",
  "Drought": "drought",
  "Epidemic": "epidemic",
  "Cold Wave": "cold_wave", "Heat Wave": "heat_wave",
  "Insect Infestation": "infestation",
  "Land Slide": "landslide", "Mud Slide": "landslide",
  "Wild Fire": "wildfire",
};

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
  const runId = `reliefweb_${new Date().toISOString().slice(0, 13).replace(/[-T:]/g, "")}`;

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

    // ── Watermark check ──
    const existingRun = await sql`
      SELECT 1 FROM hazard_alerts WHERE data_source_run_id = ${runId} AND source = ${SOURCE} LIMIT 1`;
    if (existingRun.length > 0) {
      return new Response(JSON.stringify({ status: "already_ingested", run_id: runId }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Fetch ReliefWeb disasters ──
    const apiUrl = "https://api.reliefweb.int/v1/disasters?appname=afrostorm&preset=latest&profile=list&limit=30";
    const resp = await fetch(apiUrl, {
      headers: { Accept: "application/json" },
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      console.error(`[ingest-reliefweb] API error ${resp.status}:`, errBody);
      if (resp.status === 403) {
        return new Response(JSON.stringify({
          status: "blocked",
          error: "ReliefWeb requires a registered appname. Register at https://apidoc.reliefweb.int/parameters#appname",
          run_id: runId,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw new Error(`ReliefWeb API returned ${resp.status}`);
    }

    const result = await resp.json();
    const items = result?.data || [];

    let upsertCount = 0;

    for (const item of items) {
      const fields = item.fields || {};
      if (fields.status !== "current" && fields.status !== "ongoing") continue;

      // Filter to Africa
      const countryIso3s = (fields.country || []).map((c: any) => c.iso3);
      const isAfrican = countryIso3s.some((iso: string) => AFRICA_ISO3.includes(iso));
      if (!isAfrican) continue;

      const externalId = `reliefweb_${item.id}`;
      const disasterTypes = (fields.type || []).map((t: any) => t.name);
      const primaryType = disasterTypes.map((t: string) => TYPE_MAP[t] || t.toLowerCase())[0] || "unknown";
      const countries = (fields.country || []).map((c: any) => c.name);
      const title = fields.name || "ReliefWeb disaster";

      // ReliefWeb doesn't always provide coordinates; use country centroid
      const firstCountry = fields.country?.[0];
      const lat = firstCountry?.location?.lat || 0;
      const lon = firstCountry?.location?.lon || 0;

      await sql`
        INSERT INTO hazard_alerts (
          source, external_id, type, severity, title, description,
          lat, lng, is_active, data_source_run_id, last_seen_at,
          metadata, created_at, updated_at
        ) VALUES (
          ${SOURCE}, ${externalId}, ${primaryType}, 'high', ${title.slice(0, 500)},
          ${title}, ${lat}, ${lon}, true, ${runId}, NOW(),
          ${JSON.stringify({ countries, types: disasterTypes, glide: fields.glide, date: fields.date?.created })}::jsonb,
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

    console.log(`[ingest-reliefweb] Upserted ${upsertCount} from ${items.length} ReliefWeb items`);

    return new Response(JSON.stringify({
      status: "ok",
      run_id: runId,
      total_items: items.length,
      upserted: upsertCount,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[ingest-reliefweb] Error:", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
