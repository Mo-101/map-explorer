import MoScriptsTooltip from "@/components/MoScriptsTooltip";

interface Props {
  clusterCount: number;
  rawThreatCount: number;
}

const ClusterStatsBadge = ({ clusterCount, rawThreatCount }: Props) => {
  if (clusterCount === 0 && rawThreatCount === 0) return null;

  const reductionPct = clusterCount > 0 && rawThreatCount > clusterCount
    ? Math.round((1 - clusterCount / rawThreatCount) * 100)
    : 0;

  return (
    <div className="absolute top-20 left-4 z-20">
      <MoScriptsTooltip
        title="Threat Clustering"
        description={`AI groups ${rawThreatCount} raw threat signals into ${clusterCount} spatial clusters to reduce noise. ${reductionPct}% reduction in visual clutter while preserving situational awareness.`}
        position="right"
      >
        <div className="neu-panel overflow-hidden">
          <div className="neu-glow-line" />
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="flex flex-col items-center min-w-[48px]">
              <span className="text-xl font-black text-foreground">{clusterCount}</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Clusters</span>
            </div>
            <div className="w-px h-8 bg-border/60" />
            <div className="flex flex-col items-center min-w-[48px]">
              <span className="text-xl font-black text-foreground">{rawThreatCount}</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Threats</span>
            </div>
            {reductionPct > 0 && (
              <>
                <div className="w-px h-8 bg-border/60" />
                <div className="flex flex-col items-center min-w-[40px]">
                  <span className="text-sm font-bold text-primary">{reductionPct}%</span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Reduced</span>
                </div>
              </>
            )}
          </div>
        </div>
      </MoScriptsTooltip>
    </div>
  );
};

export default ClusterStatsBadge;
