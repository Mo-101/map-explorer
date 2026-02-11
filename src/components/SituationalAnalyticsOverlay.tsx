import type { AnalyticsOutput } from "@/hooks/useSituationalMarkers";

interface Props {
  analytics: AnalyticsOutput;
  moscriptsVoice: string;
}

const SituationalAnalyticsOverlay = ({ analytics, moscriptsVoice }: Props) => {
  return (
    <div className="absolute top-20 right-4 z-20 w-[360px] max-w-[90vw] rounded-xl border border-border/50 bg-card/85 backdrop-blur-md shadow-lg">
      <div className="p-4 border-b border-border/50">
        <div className="text-sm font-semibold text-foreground/90">Situational analytics</div>
        <div className="text-[11px] text-muted-foreground">Analysis only</div>
      </div>

      <div className="p-4 grid grid-cols-2 gap-3">
        <div>
          <div className="text-2xl font-black text-foreground">
            {analytics.total_threats}
          </div>
          <div className="text-[11px] text-muted-foreground">Markers</div>
        </div>
        <div>
          <div className="text-2xl font-black text-foreground">
            {analytics.regions_affected.length}
          </div>
          <div className="text-[11px] text-muted-foreground">Regions</div>
        </div>
      </div>

      <div className="px-4 pb-4">
        <div className="text-[11px] font-semibold text-muted-foreground mb-2">By type</div>
        <div className="space-y-1">
          {Object.entries(analytics.by_type).map(([t, c]) => (
            <div key={t} className="flex items-center justify-between text-xs">
              <span className="text-foreground/80">{t.replace(/_/g, " ")}</span>
              <span className="font-semibold text-foreground">{c}</span>
            </div>
          ))}
        </div>
      </div>

      {moscriptsVoice && (
        <div className="px-4 py-3 border-t border-border/50 bg-secondary/40 text-xs text-foreground/90">
          {moscriptsVoice}
        </div>
      )}

      <div className="px-4 py-2 border-t border-border/50 text-[10px] text-muted-foreground">
        Updated: {new Date(analytics.timestamp).toLocaleTimeString()}
      </div>
    </div>
  );
};

export default SituationalAnalyticsOverlay;
