import MoScriptsTooltip from "@/components/MoScriptsTooltip";

interface Props {
  clusterCount: number;
  rawThreatCount: number;
}

const ClusterStatsBadge = ({ clusterCount, rawThreatCount }: Props) => {
  if (clusterCount === 0 && rawThreatCount === 0) return null;

  return (
    <div className="absolute top-36 lg:top-20 left-4 z-20">
      <MoScriptsTooltip
        title="Alert Locations"
        description={`${rawThreatCount} alerts at ${clusterCount} locations. Each globe contains the signals at that location; zoom in to separate nearby locations.`}
        position="right"
      >
        <div className="neu-panel overflow-hidden">
          <div className="neu-glow-line" />
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="flex flex-col items-center min-w-[48px]">
              <span className="text-xl font-black text-foreground">{clusterCount}</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Locations</span>
            </div>
            <div className="w-px h-8 bg-border/60" />
            <div className="flex flex-col items-center min-w-[48px]">
              <span className="text-xl font-black text-foreground">{rawThreatCount}</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Threats</span>
            </div>

          </div>
        </div>
      </MoScriptsTooltip>
    </div>
  );
};

export default ClusterStatsBadge;
