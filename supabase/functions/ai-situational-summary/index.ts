import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function buildFallbackSummary(threats: any[]): string {
  if (!Array.isArray(threats) || threats.length === 0) {
    return "No active hazard signals to summarize.";
  }

  const counts = threats.reduce((acc: Record<string, number>, t: any) => {
    const severity = String(t?.severity || "unknown").toLowerCase();
    acc[severity] = (acc[severity] || 0) + 1;
    return acc;
  }, {});

  const topRegions = threats
    .slice(0, 5)
    .map((t: any) => String(t?.title || t?.location || t?.threat_type || t?.type || "regional signal"))
    .join("; ");

  const extreme = counts.extreme || 0;
  const high = counts.high || 0;
  return `${threats.length} active hazard signals are being monitored across Africa, including ${extreme} extreme and ${high} high-severity signals. Priority observations: ${topRegions}. Maintain situational awareness while automated AI briefing is temporarily unavailable.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { threats } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ summary: buildFallbackSummary(threats), degraded: true, reason: "AI unavailable" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!threats || !Array.isArray(threats) || threats.length === 0) {
      return new Response(
        JSON.stringify({ summary: "No active hazard signals to summarize." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Compact threat data for the prompt
    const compactThreats = threats.slice(0, 20).map((t: any) => ({
      type: t.threat_type || t.type,
      severity: t.severity,
      title: t.title,
      lat: t.center_lat || t.lat,
      lng: t.center_lng || t.lng,
    }));

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: "You are a meteorological analyst for African disaster monitoring. Generate a concise 2-3 sentence situational summary from the threat data provided. Be specific about locations, severity levels, and recommended awareness. Use professional, authoritative tone. Do not use markdown."
          },
          {
            role: "user",
            content: `Current active threat signals:\n${JSON.stringify(compactThreats, null, 2)}\n\nProvide a brief situational summary.`
          }
        ],
        max_tokens: 200,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(
          JSON.stringify({ summary: buildFallbackSummary(threats), degraded: true, reason: "AI rate limited" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (status === 402) {
        return new Response(
          JSON.stringify({ summary: buildFallbackSummary(threats), degraded: true, reason: "AI credits unavailable" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errText = await response.text();
      console.error("AI gateway error:", status, errText);
      return new Response(
        JSON.stringify({ summary: buildFallbackSummary(threats), degraded: true, reason: "AI gateway error" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content?.trim() || null;

    return new Response(
      JSON.stringify({ summary }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("ai-situational-summary error:", e);
    return new Response(
      JSON.stringify({ summary: "Situational summary temporarily unavailable. Core hazard monitoring remains active.", degraded: true, reason: "Summary generation error" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
