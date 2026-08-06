import { useState, useEffect } from 'react';
import styles from './MoScriptsAnalysisPanel.module.css';
import { fetchRealtimeThreats } from '@/services/hazardsApi';

interface AnalysisItem {
  module: string;
  text: string;
  timestamp: string;
  tags: string[];
}

interface AnalysisData {
  mode: string;
  timestamp: string;
  artifacts_used: string[];
  analysis: AnalysisItem[];
  metadata: {
    system_mode: string;
    provenance: string;
  };
}

function buildAnalysisFromThreats(threats: any[]): AnalysisData {
  const now = new Date().toISOString();
  const sources = new Set<string>();
  const severityCounts: Record<string, number> = {};
  const typeCounts: Record<string, number> = {};
  const regionThreats: Record<string, any[]> = {};

  for (const t of threats) {
    const src = t.detection_details?.variable || t.type || 'unknown';
    sources.add(src);
    const sev = t.severity || 'unknown';
    severityCounts[sev] = (severityCounts[sev] || 0) + 1;
    const type = t.threat_type || t.type || 'unknown';
    typeCounts[type] = (typeCounts[type] || 0) + 1;

    const title = t.title || '';
    const region = title.split('—')[1]?.trim() || title.split(' — ')[1]?.trim() || 'Unspecified';
    if (!regionThreats[region]) regionThreats[region] = [];
    regionThreats[region].push(t);
  }

  const analysis: AnalysisItem[] = [];

  // Overview
  const extremeCount = severityCounts['extreme'] || 0;
  const highCount = severityCounts['high'] || 0;
  analysis.push({
    module: 'Threat Overview',
    text: `${threats.length} active hazard signals detected across Africa. ${extremeCount} extreme severity, ${highCount} high severity. Types: ${Object.entries(typeCounts).map(([k, v]) => `${k} (${v})`).join(', ')}.`,
    timestamp: now,
    tags: ['overview', 'system1'],
  });

  // Top regions
  const topRegions = Object.entries(regionThreats)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 3);

  if (topRegions.length > 0) {
    const regionSummaries = topRegions.map(([region, rThreats]) => {
      const extremes = rThreats.filter(t => t.severity === 'extreme').length;
      return `${region}: ${rThreats.length} signals (${extremes} extreme)`;
    });
    analysis.push({
      module: 'Regional Focus',
      text: regionSummaries.join('. ') + '.',
      timestamp: now,
      tags: ['regional', 'priority'],
    });
  }

  // MSLP analysis
  const mslpThreats = threats.filter(t => t.detection_details?.variable === 'mslp');
  if (mslpThreats.length > 0) {
    const minPressure = Math.min(...mslpThreats.map(t => t.detection_details?.value_hpa ?? 1013));
    analysis.push({
      module: 'Pressure Analysis',
      text: `${mslpThreats.length} low-pressure signals detected from GFS data. Minimum MSLP: ${Math.round(minPressure)} hPa. Sustained low pressure indicates potential cyclonic development or deep convective systems.`,
      timestamp: now,
      tags: ['mslp', 'gfs'],
    });
  }

  // Wind analysis
  const windThreats = threats.filter(t => t.detection_details?.variable === 'wind');
  if (windThreats.length > 0) {
    const maxWind = Math.max(...windThreats.map(t => t.detection_details?.value_ms ?? 0));
    analysis.push({
      module: 'Wind Analysis',
      text: `${windThreats.length} high-wind signals detected. Maximum wind speed: ${maxWind.toFixed(1)} m/s. Monitoring for storm intensification and impact zones.`,
      timestamp: now,
      tags: ['wind', 'gfs'],
    });
  }

  // If no threats
  if (threats.length === 0) {
    analysis.push({
      module: 'Status',
      text: 'No active hazard signals above threshold. All monitoring points within normal parameters. Ingestion pipelines operational.',
      timestamp: now,
      tags: ['clear', 'nominal'],
    });
  }

  const artifactSources = ['GFS Forecast (NOAA)', 'GPM IMERG (NASA)', 'JTWC Advisories'];

  return {
    mode: 'analysis',
    timestamp: now,
    artifacts_used: artifactSources,
    analysis,
    metadata: {
      system_mode: 'operational',
      provenance: 'System 1 → Edge Ingestion → Neon DB',
    },
  };
}

const MoScriptsAnalysisPanel = () => {
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalysis = async () => {
    try {
      const data = await fetchRealtimeThreats();
      const threats = Array.isArray(data?.threats) ? data.threats : [];
      const analysisData = buildAnalysisFromThreats(threats);
      setAnalysis(analysisData);
      setError(null);
    } catch (err) {
      console.error('Error fetching analysis:', err);
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const refreshAnalysis = async () => {
    setLoading(true);
    await fetchAnalysis();
  };

  const formatTimestamp = (timestamp: string) => {
    if (!timestamp) return 'Unknown';
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return timestamp;
    }
  };

  useEffect(() => {
    fetchAnalysis();
    const interval = setInterval(fetchAnalysis, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={styles.analysisPanel}>
      <div className={styles.panelHeader}>
        <h1 className={styles.panelTitle}>🧠 Situational Analysis (Not an Alert)</h1>
        <span className={styles.modeBadge}>ANALYSIS ONLY</span>
      </div>
      
      <div className={styles.panelContent}>
        <button 
          className={styles.refreshBtn} 
          onClick={refreshAnalysis}
          disabled={loading}
        >
          {loading ? 'Refreshing...' : 'Refresh Analysis'}
        </button>
        
        <div id="analysis-content">
          {loading && !analysis && (
            <div className={styles.loading}>Loading analysis...</div>
          )}
          
          {error && (
            <div className={styles.error}>
              <strong>Analysis Unavailable</strong><br />
              {error}<br />
              <small>Please try again later.</small>
            </div>
          )}
          
          {analysis && !loading && (
            <>
              {analysis.analysis.length === 0 ? (
                <div className={styles.analysisItem}>
                  <div className={styles.analysisText}>No analysis available at this time.</div>
                  <div className={styles.timestamp}>Last updated: {formatTimestamp(analysis.timestamp)}</div>
                </div>
              ) : (
                <>
                  {analysis.analysis.map((item, index) => (
                    <div key={index} className={styles.analysisItem}>
                      <div className={styles.analysisModule}>{item.module}</div>
                      <div className={styles.analysisText}>{item.text}</div>
                      <div className={styles.analysisMeta}>
                        <span>Module: {item.module}</span>
                        <span>Updated: {formatTimestamp(item.timestamp)}</span>
                      </div>
                    </div>
                  ))}
                  
                  {analysis.artifacts_used && analysis.artifacts_used.length > 0 && (
                    <div className={styles.artifacts}>
                      <div style={{ fontSize: '12px', color: '#6c757d', marginBottom: '8px' }}>
                        Data Sources:
                      </div>
                      <div className={styles.artifactList}>
                        {analysis.artifacts_used.map((artifact, index) => (
                          <span key={index} className={styles.artifactTag}>{artifact}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div className={styles.timestamp}>
                    Analysis generated: {formatTimestamp(analysis.timestamp)} | 
                    System Mode: {analysis.metadata?.system_mode || 'analysis'} | 
                    Provenance: {analysis.metadata?.provenance || 'System 2'}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default MoScriptsAnalysisPanel;
