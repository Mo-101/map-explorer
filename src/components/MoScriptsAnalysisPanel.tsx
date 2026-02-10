import { useState, useEffect } from 'react';
import styles from './MoScriptsAnalysisPanel.module.css';

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

function getAnalysisApiBaseUrl() {
  const raw = ((import.meta as any).env?.VITE_ANALYSIS_API_BASE_URL as string | undefined) || "";
  const cleaned = raw.replace(/['"]/g, "").replace(/\/$/, "");
  if (cleaned) return cleaned;
  return import.meta.env.DEV ? "http://localhost:5001" : "";
}

const MoScriptsAnalysisPanel = () => {
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalysis = async () => {
    try {
      const base = getAnalysisApiBaseUrl();
      const response = await fetch(`${base}/api/analysis`);
      const data = await response.json();
      
      if (response.ok) {
        setAnalysis(data);
        setError(null);
      } else {
        setError('Failed to fetch analysis');
      }
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
      const date = new Date(timestamp);
      return date.toLocaleString();
    } catch {
      return timestamp;
    }
  };

  const escapeHtml = (text: string) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };

  useEffect(() => {
    // Initial load
    fetchAnalysis();
    
    // Auto-refresh every 5 minutes
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
                      <div className={styles.analysisText}>{escapeHtml(item.text)}</div>
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
