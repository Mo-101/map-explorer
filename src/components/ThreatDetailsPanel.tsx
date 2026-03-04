import { useState, useEffect, useCallback } from 'react';
import { X, MapPin, Wind, CloudRain, AlertTriangle, Clock, Activity } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface ThreatDetail {
  id: string;
  title: string;
  type: string;
  severity: string;
  description: string;
  lat: number;
  lng: number;
  intensity: number;
  forecast_hour?: number;
  source_artifact?: Record<string, any>;
  data_source_run_id?: string;
  updated_at?: string;
  event_at?: string;
  metadata?: Record<string, any>;
}

interface ThreatDetailsPanelProps {
  threat: ThreatDetail | null;
  onClose: () => void;
  allThreats?: ThreatDetail[];
}

const typeIcons: Record<string, typeof Wind> = {
  cyclone: Wind,
  storm: Wind,
  flood: CloudRain,
  drought: AlertTriangle,
};

const severityStyles: Record<string, { dot: string; badge: string }> = {
  extreme: { dot: 'bg-destructive', badge: 'bg-destructive/15 text-red-400 border-destructive/25' },
  high: { dot: 'bg-amber-500', badge: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
  moderate: { dot: 'bg-yellow-500', badge: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25' },
  low: { dot: 'bg-emerald-500', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
};

function buildTimelineData(threat: ThreatDetail, allThreats: ThreatDetail[]): { hour: number; intensity: number }[] {
  const variable = threat.source_artifact?.variable;
  const locKey = `${threat.lat}_${threat.lng}`;

  const related = allThreats
    .filter(t => {
      const tLocKey = `${t.lat}_${t.lng}`;
      return tLocKey === locKey && t.source_artifact?.variable === variable;
    })
    .sort((a, b) => (a.forecast_hour ?? 0) - (b.forecast_hour ?? 0));

  if (related.length > 1) {
    return related.map(t => ({
      hour: t.forecast_hour ?? 0,
      intensity: t.intensity,
    }));
  }

  const range = threat.source_artifact?.forecast_range;
  if (range && Array.isArray(range)) {
    const points: { hour: number; intensity: number }[] = [];
    for (let h = range[0]; h <= range[1]; h++) {
      points.push({ hour: h, intensity: threat.intensity * (0.9 + 0.1 * Math.sin(h * 0.5)) });
    }
    return points;
  }

  return [{ hour: threat.forecast_hour ?? 0, intensity: threat.intensity }];
}

const ThreatDetailsPanel = ({ threat, onClose, allThreats = [] }: ThreatDetailsPanelProps) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (threat) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [threat]);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 200);
  }, [onClose]);

  if (!threat) return null;

  const Icon = typeIcons[threat.type] || AlertTriangle;
  const sev = severityStyles[threat.severity] || severityStyles.moderate;
  const timeline = buildTimelineData(threat, allThreats);
  const persistHours = threat.source_artifact?.persistence_hours;
  const fRange = threat.source_artifact?.forecast_range;

  return (
    <div
      className={`fixed bottom-12 left-1/2 -translate-x-1/2 z-50 w-[420px] max-w-[95vw] neu-panel-elevated overflow-hidden transition-all duration-200 ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
      }`}
    >
      {/* Severity glow line */}
      <div className="neu-glow-line" />

      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-border/30">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`p-2 rounded-lg border ${sev.badge}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground truncate">{threat.title}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${sev.badge}`}>
                {threat.severity}
              </span>
              <span className="text-[10px] text-muted-foreground capitalize">{threat.type}</span>
            </div>
          </div>
        </div>
        <button
          onClick={handleClose}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Description */}
      <div className="px-4 py-3 border-b border-border/30">
        <p className="text-xs text-foreground/80 leading-relaxed">{threat.description}</p>
      </div>

      {/* Metadata grid */}
      <div className="grid grid-cols-3 gap-px bg-border/20">
        <div className="p-3 text-center" style={{ background: 'hsla(220, 18%, 10%, 0.5)' }}>
          <MapPin className="h-3 w-3 mx-auto text-muted-foreground mb-1" />
          <div className="text-[10px] text-muted-foreground">Location</div>
          <div className="text-xs font-semibold text-foreground">
            {threat.lat.toFixed(1)}°, {threat.lng.toFixed(1)}°
          </div>
        </div>
        <div className="p-3 text-center" style={{ background: 'hsla(220, 18%, 10%, 0.5)' }}>
          <Activity className="h-3 w-3 mx-auto text-muted-foreground mb-1" />
          <div className="text-[10px] text-muted-foreground">Intensity</div>
          <div className="text-xs font-semibold text-foreground">
            {threat.intensity.toFixed(1)}
            {threat.source_artifact?.variable === 'mslp' ? ' hPa' :
             threat.source_artifact?.variable === 'wind_10m' ? ' m/s' :
             threat.source_artifact?.variable === 'precip_6h' ? ' mm' : ''}
          </div>
        </div>
        <div className="p-3 text-center" style={{ background: 'hsla(220, 18%, 10%, 0.5)' }}>
          <Clock className="h-3 w-3 mx-auto text-muted-foreground mb-1" />
          <div className="text-[10px] text-muted-foreground">Persistence</div>
          <div className="text-xs font-semibold text-foreground">
            {persistHours ? `${persistHours}h` : '—'}
          </div>
        </div>
      </div>

      {/* GDACS Impact Model section */}
      {(() => {
        const gdacs = threat.metadata?.gdacs || threat.source_artifact?.gdacs;
        if (!gdacs) return null;
        const levelColor = gdacs.level === 'red' ? 'bg-destructive/15 text-red-400 border-destructive/25' :
          gdacs.level === 'orange' ? 'bg-amber-500/15 text-amber-400 border-amber-500/25' :
          'bg-emerald-500/15 text-emerald-400 border-emerald-500/25';
        return (
          <div className="px-4 py-3 border-b border-border/30">
            <div className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
              GDACS Impact Model
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${levelColor}`}>
                {gdacs.level}
              </span>
              {gdacs.score != null && (
                <span className="text-[10px] text-foreground/70 px-1.5 py-0.5 rounded border border-border/30 bg-secondary/30">
                  Score: {Number(gdacs.score).toFixed(2)}
                </span>
              )}
              {gdacs.category && (
                <span className="text-[10px] text-foreground/70 px-1.5 py-0.5 rounded border border-border/30 bg-secondary/30">
                  {gdacs.category}
                </span>
              )}
              {gdacs.vulnerability != null && (
                <span className="text-[10px] text-foreground/70 px-1.5 py-0.5 rounded border border-border/30 bg-secondary/30">
                  Vuln: {(gdacs.vulnerability * 100).toFixed(0)}%
                </span>
              )}
              {gdacs.country && (
                <span className="text-[10px] text-foreground/70 px-1.5 py-0.5 rounded border border-border/30 bg-secondary/30">
                  {gdacs.country}
                </span>
              )}
              {gdacs.population_affected && (
                <span className="text-[10px] text-foreground/70 px-1.5 py-0.5 rounded border border-border/30 bg-secondary/30">
                  Pop: {Number(gdacs.population_affected).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        );
      })()}
      {timeline.length > 1 && (
        <div className="p-4 border-t border-border/30">
          <div className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
            Forecast Timeline {fRange ? `(f+${fRange[0]}h – f+${fRange[1]}h)` : ''}
          </div>
          <div className="h-24">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeline} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="threatGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(195, 90%, 50%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(195, 90%, 50%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: 9, fill: 'hsl(215, 12%, 55%)' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `f+${v}h`}
                />
                <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(220, 18%, 10%)',
                    border: '1px solid hsl(220, 14%, 18%)',
                    borderRadius: '8px',
                    fontSize: '11px',
                    color: 'hsl(210, 20%, 95%)',
                  }}
                  formatter={(val: number) => [val.toFixed(1), 'Intensity']}
                  labelFormatter={(v) => `Forecast hour: f+${v}h`}
                />
                <Area
                  type="monotone"
                  dataKey="intensity"
                  stroke="hsl(195, 90%, 50%)"
                  strokeWidth={1.5}
                  fill="url(#threatGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-2 border-t border-border/30 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-pulse" />
          <span className="text-[9px] font-mono text-muted-foreground/50">
            {threat.data_source_run_id || 'GFS'}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground/60">
          {threat.updated_at ? new Date(threat.updated_at).toLocaleString() : new Date().toLocaleString()}
        </span>
      </div>
    </div>
  );
};

export default ThreatDetailsPanel;
