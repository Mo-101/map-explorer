/**
 * MoScripts Map Card Component
 * ============================
 * 
 * PURPOSE:
 *   Display System 2 analysis results on map interface.
 *   Bottom right placement, neutral design, no urgency indicators.
 * 
 * RESPONSIBILITIES:
 *   - Fetch analysis from backend API
 *   - Render card with analysis content
 *   - Maintain visual safety (no alerts, no urgency)
 *   - Provide real-time updates
 * 
 * FORBIDDEN:
 *   ❌ Alert styling (red, flashing, urgent)
 *   ❌ Predictive language
 *   ❌ Severity indicators
 *   ❌ Calls to action
 * 
 * ALLOWED:
 *   ✅ Neutral colors and design
 *   ✅ Descriptive analysis only
 *   ✅ Timestamp and provenance
 *   ✅ Data source attribution
 */

class MoScriptsMapCard {
    constructor(mapContainer, options = {}) {
        this.mapContainer = mapContainer;
        this.options = {
            apiUrl: options.apiUrl || 'http://localhost:5001/api/analysis',
            refreshInterval: options.refreshInterval || 300000, // 5 minutes
            position: options.position || 'bottom-right',
            ...options
        };
        
        this.card = null;
        this.isVisible = true;
        this.lastUpdate = null;
        
        this.init();
    }
    
    init() {
        this.createCard();
        this.startAutoRefresh();
        this.fetchAnalysis(); // Initial fetch
    }
    
    createCard() {
        // Create card container
        this.card = document.createElement('div');
        this.card.id = 'moscripts-card';
        this.card.className = 'moscripts-card';
        
        // Add CSS styles
        this.addStyles();
        
        // Position card
        this.positionCard();
        
        // Add to map container
        this.mapContainer.appendChild(this.card);
        
        // Create card content
        this.renderCard({
            mode: 'analysis',
            timestamp: new Date().toISOString(),
            artifacts_used: [],
            analysis: [
                {
                    module: 'system',
                    text: 'Loading analysis...',
                    timestamp: new Date().toISOString(),
                    tags: ['loading']
                }
            ],
            metadata: {
                system_mode: 'analysis',
                provenance: 'System 2 Analysis Mode'
            }
        });
    }
    
    addStyles() {
        const styles = `
            #moscripts-card {
                position: absolute;
                bottom: 20px;
                right: 20px;
                width: 380px;
                max-width: 90vw;
                background: rgba(255, 255, 255, 0.95);
                border: 1px solid #e0e0e0;
                border-radius: 8px;
                padding: 16px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 14px;
                color: #333;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                z-index: 1000;
                backdrop-filter: blur(4px);
            }
            
            #moscripts-card .card-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 12px;
                padding-bottom: 8px;
                border-bottom: 1px solid #e9ecef;
            }
            
            #moscripts-card .card-title {
                margin: 0;
                font-size: 16px;
                font-weight: 600;
                color: #495057;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            #moscripts-card .mode-badge {
                background: #6c757d;
                color: white;
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 11px;
                font-weight: 500;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            #moscripts-card .card-content {
                margin-bottom: 12px;
            }
            
            #moscripts-card .analysis-item {
                margin-bottom: 12px;
                padding: 8px;
                background: #f8f9fa;
                border-radius: 6px;
                border-left: 3px solid #6c757d;
            }
            
            #moscripts-card .analysis-item:last-child {
                margin-bottom: 0;
            }
            
            #moscripts-card .module {
                font-size: 12px;
                font-weight: 600;
                color: #495057;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 4px;
            }
            
            #moscripts-card .text {
                line-height: 1.4;
                color: #212529;
                font-size: 13px;
            }
            
            #moscripts-card .card-footer {
                font-size: 11px;
                color: #6c757d;
                padding-top: 8px;
                border-top: 1px solid #e9ecef;
            }
            
            #moscripts-card .footer-row {
                display: flex;
                justify-content: space-between;
                margin-bottom: 2px;
            }
            
            #moscripts-card .refresh-btn {
                background: #007bff;
                color: white;
                border: none;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 11px;
                cursor: pointer;
                margin-top: 8px;
            }
            
            #moscripts-card .refresh-btn:hover {
                background: #0056b3;
            }
            
            #moscripts-card .refresh-btn:disabled {
                background: #6c757d;
                cursor: not-allowed;
            }
            
            #moscripts-card .loading {
                text-align: center;
                color: #6c757d;
                font-style: italic;
            }
            
            #moscripts-card .error {
                background: #f8d7da;
                color: #721c24;
                padding: 8px;
                border-radius: 4px;
                border-left: 3px solid #dc3545;
                font-size: 12px;
            }
            
            @media (max-width: 768px) {
                #moscripts-card {
                    bottom: 10px;
                    right: 10px;
                    left: 10px;
                    width: auto;
                    max-width: none;
                }
            }
        `;
        
        // Add styles to document
        const styleSheet = document.createElement('style');
        styleSheet.textContent = styles;
        document.head.appendChild(styleSheet);
    }
    
    positionCard() {
        // Position based on options
        switch (this.options.position) {
            case 'bottom-right':
                this.card.style.bottom = '20px';
                this.card.style.right = '20px';
                this.card.style.top = 'auto';
                this.card.style.left = 'auto';
                break;
            case 'bottom-left':
                this.card.style.bottom = '20px';
                this.card.style.left = '20px';
                this.card.style.top = 'auto';
                this.card.style.right = 'auto';
                break;
            case 'top-right':
                this.card.style.top = '20px';
                this.card.style.right = '20px';
                this.card.style.bottom = 'auto';
                this.card.style.left = 'auto';
                break;
            case 'top-left':
                this.card.style.top = '20px';
                this.card.style.left = '20px';
                this.card.style.bottom = 'auto';
                this.card.style.right = 'auto';
                break;
        }
    }
    
    async fetchAnalysis() {
        try {
            const response = await fetch(this.options.apiUrl);
            const data = await response.json();
            
            if (response.ok) {
                this.renderCard(data);
                this.lastUpdate = new Date();
            } else {
                this.renderError('Failed to fetch analysis');
            }
        } catch (error) {
            console.error('Error fetching analysis:', error);
            this.renderError('Network error');
        }
    }
    
    renderCard(data) {
        const timestamp = new Date(data.timestamp).toLocaleString();
        const artifacts = data.artifacts_used || [];
        
        this.card.innerHTML = `
            <div class="card-header">
                <h3 class="card-title">
                    🧠 Situational Analysis (Not an Alert)
                </h3>
                <span class="mode-badge">ANALYSIS ONLY</span>
            </div>
            
            <div class="card-content">
                ${data.analysis.map(item => `
                    <div class="analysis-item">
                        <div class="module">${item.module}</div>
                        <div class="text">${this.escapeHtml(item.text)}</div>
                    </div>
                `).join('')}
            </div>
            
            <div class="card-footer">
                <div class="footer-row">
                    <span>Updated: ${timestamp}</span>
                    <span>Mode: ${data.metadata?.system_mode || 'analysis'}</span>
                </div>
                <div class="footer-row">
                    <span>Sources: ${artifacts.join(', ') || 'None'}</span>
                    <span>${data.metadata?.provenance || 'System 2'}</span>
                </div>
                <button class="refresh-btn" onclick="window.moscriptsCard.refreshAnalysis()">
                    Refresh
                </button>
            </div>
        `;
    }
    
    renderError(message) {
        this.card.innerHTML = `
            <div class="card-header">
                <h3 class="card-title">
                    🧠 Situational Analysis (Not an Alert)
                </h3>
                <span class="mode-badge">ANALYSIS ONLY</span>
            </div>
            
            <div class="card-content">
                <div class="error">
                    <strong>Analysis Unavailable</strong><br>
                    ${message}<br>
                    <small>Please try again later.</small>
                </div>
            </div>
            
            <div class="card-footer">
                <button class="refresh-btn" onclick="window.moscriptsCard.refreshAnalysis()">
                    Retry
                </button>
            </div>
        `;
    }
    
    refreshAnalysis() {
        const btn = this.card.querySelector('.refresh-btn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Refreshing...';
        }
        
        this.fetchAnalysis().finally(() => {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Refresh';
            }
        });
    }
    
    startAutoRefresh() {
        setInterval(() => {
            this.fetchAnalysis();
        }, this.options.refreshInterval);
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    toggle() {
        this.isVisible = !this.isVisible;
        this.card.style.display = this.isVisible ? 'block' : 'none';
    }
    
    destroy() {
        if (this.card && this.card.parentNode) {
            this.card.parentNode.removeChild(this.card);
        }
    }
}

// Auto-initialize when DOM is ready
if (typeof window !== 'undefined') {
    window.moscriptsCard = null;
    
    document.addEventListener('DOMContentLoaded', function() {
        // Find map container (adjust selector as needed)
        const mapContainer = document.querySelector('.map-container') || 
                           document.querySelector('#map') || 
                           document.querySelector('.map') ||
                           document.body;
        
        if (mapContainer) {
            window.moscriptsCard = new MoScriptsMapCard(mapContainer, {
                position: 'bottom-right',
                apiUrl: 'http://localhost:5001/api/analysis',
                refreshInterval: 300000 // 5 minutes
            });
            
            console.log('MoScripts Map Card initialized');
        } else {
            console.warn('Map container not found for MoScripts card');
        }
    });
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MoScriptsMapCard;
}
