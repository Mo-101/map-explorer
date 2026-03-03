interface Props {
  clusterCount: number;
  rawThreatCount: number;
}

const ClusterStatsBadge = ({ clusterCount, rawThreatCount }: Props) => {
  if (clusterCount === 0 && rawThreatCount === 0) return null;

  return (
    <div className="absolute top-20 left-4 z-20 flex items-center gap-2 rounded-lg border border-border/50 bg-card/85 backdrop-blur-md shadow-lg px-3 py-2">
      <div className="flex flex-col items-center min-w-[48px]">
        <span className="text-xl font-black text-foreground">{clusterCount}</span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Clusters</span>
      </div>
      <div className="w-px h-8 bg-border/60" />
      <div className="flex flex-col items-center min-w-[48px]">
        <span className="text-xl font-black text-foreground">{rawThreatCount}</span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Threats</span>
      </div>
      {clusterCount > 0 && rawThreatCount > clusterCount && (
        <>
          <div className="w-px h-8 bg-border/60" />
          <div className="flex flex-col items-center min-w-[40px]">
            <span className="text-sm font-bold text-primary">
              {Math.round((1 - clusterCount / rawThreatCount) * 100)}%
            </span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Reduced</span>
          </div>
        </>
      )}
    </div>
  );
};

export default ClusterStatsBadge;
