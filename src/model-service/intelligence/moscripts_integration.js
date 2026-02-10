/**
 * MoScripts Integration for Existing Maps
 * ====================================
 * 
 * PURPOSE:
 *   Add MoScripts analysis card to existing map interface.
 *   Works with Leaflet, OpenLayers, Mapbox, or any map library.
 * 
 * RESPONSIBILITIES:
 *   - Inject MoScripts card into existing map
 *   - Maintain map functionality
 *   - Preserve existing weather layers
 *   - Add analysis without disrupting current UI
 * 
 * FORBIDDEN:
 *   ❌ Modify existing map functionality
 *   ❌ Remove or alter weather layers
 *   ❌ Change map behavior
 *   ❌ Interfere with existing controls
 * 
 * ALLOWED:
 *   ✅ Add card overlay
 *   ✅ Position card strategically
 *   ✅ Maintain map interactivity
 *   ✅ Preserve existing layers
 */

// MoScripts Map Card Integration
class MoScriptsIntegration {
    constructor(mapInstance, options = {}) {
        this.map = mapInstance;
        this.options = {
            position: options.position || 'bottom-right',
            apiUrl: options.apiUrl || 'http://localhost:5001/api/analysis',
            refreshInterval: options.refreshInterval || 300000,
            zIndex: options.zIndex || 1000,
            ...options
        };
        
        this.card = null;
        this.isVisible = true;
        
        this.init();
    }
    
    init() {
        // Wait for map to be ready
        if (this.map) {
            this.addCardToMap();
        } else {
            console.warn('Map instance not found');
        }
    }
    
    addCardToMap() {
        // Create card container
        this.card = document.createElement('div');
        this.card.id = 'moscripts-card';
        this.card.className = 'moscripts-card';
        
        // Add styles
        this.addStyles();
        
        // Position card
        this.positionCard();
        
        // Add to map container
        this.addCardToMapContainer();
        
        // Initialize card functionality
        this.initializeCard();
        
        console.log('✅ MoScripts card added to existing map');
    }
    
    addCardToMapContainer() {
        // Try different map container selectors
        const mapContainers = [
            this.map.getContainer(), // Leaflet
            this.map.getTargetElement(), // OpenLayers
            this.map._container, // Mapbox
            this.map.container, // Generic
            document.querySelector('.mapboxgl-map'), // Mapbox GL
            document.querySelector('.ol-viewport'), // OpenLayers
            document.querySelector('#map'), // Generic
            document.querySelector('.map'), // Generic
            document.body // Fallback
        ];
        
        for (const container of mapContainers) {
            if (container && this.isValidContainer(container)) {
                container.appendChild(this.card);
                console.log('✅ MoScripts card added to container:', container.className || container.id);
                return;
            }
        }
        
        console.warn('❌ Could not find suitable map container');
    }
    
    isValidContainer(container) {
        return container && 
               container.nodeType === Node.ELEMENT_NODE &&
               container.appendChild;
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
                z-index: ${this.options.zIndex};
                backdrop-filter: blur(4px);
                pointer-events: auto;
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
            
            #moscripts-card .toggle-btn {
                position: absolute;
                top: 8px;
                right: 8px;
                background: transparent;
                border: none;
                font-size: 16px;
                cursor: pointer;
                color: #6c757d;
                padding: 2px;
            }
            
            #moscripts-card .toggle-btn:hover {
                color: #495057;
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
            
            /* Ensure card doesn't interfere with map controls */
            .leaflet-control-container {
                z-index: ${this.options.zIndex + 1} !important;
            }
            
            .mapboxgl-ctrl {
                z-index: ${this.options.zIndex + 1} !important;
            }
            
            .ol-control {
                z-index: ${this.options.zIndex + 1} !important;
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
    
    initializeCard() {
        // Add toggle button
        this.addToggleButton();
        
        // Start with loading state
        this.renderLoadingState();
        
        // Fetch initial data
        this.fetchAnalysis();
        
        // Start auto-refresh
        this.startAutoRefresh();
    }
    
    addToggleButton() {
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'toggle-btn';
        toggleBtn.innerHTML = '×';
        toggleBtn.title = 'Toggle MoScripts Analysis';
        toggleBtn.onclick = () => this.toggle();
        
        this.card.appendChild(toggleBtn);
    }
    
    renderLoadingState() {
        this.card.innerHTML = `
            <button class="toggle-btn" onclick="window.moscriptsIntegration.toggle()">×</button>
            <div class="card-header">
                <h3 class="card-title">
                    🧠 Situational Analysis (Not an Alert)
                </h3>
                <span class="mode-badge">ANALYSIS ONLY</span>
            </div>
            
            <div class="card-content">
                <div class="loading">Loading analysis...</div>
            </div>
            
            <div class="card-footer">
                <div class="footer-row">
                    <span>Mode: analysis</span>
                    <span>System 2</span>
                </div>
            </div>
        `;
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
            <button class="toggle-btn" onclick="window.moscriptsIntegration.toggle()">×</button>
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
                <button class="refresh-btn" onclick="window.moscriptsIntegration.refreshAnalysis()">
                    Refresh
                </button>
            </div>
        `;
    }
    
    renderError(message) {
        this.card.innerHTML = `
            <button class="toggle-btn" onclick="window.moscriptsIntegration.toggle()">×</button>
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
                <button class="refresh-btn" onclick="window.moscriptsIntegration.refreshAnalysis()">
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
            if (this.isVisible) {
                this.fetchAnalysis();
            }
        }, this.options.refreshInterval);
    }
    
    toggle() {
        this.isVisible = !this.isVisible;
        this.card.style.display = this.isVisible ? 'block' : 'none';
        
        // Update toggle button
        const toggleBtn = this.card.querySelector('.toggle-btn');
        if (toggleBtn) {
            toggleBtn.innerHTML = this.isVisible ? '×' : '◀';
        }
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    destroy() {
        if (this.card && this.card.parentNode) {
            this.card.parentNode.removeChild(this.card);
        }
    }
}

// Auto-initialize for common map libraries
function initializeMoScripts(mapInstance, options = {}) {
    if (mapInstance) {
        window.moscriptsIntegration = new MoScriptsIntegration(mapInstance, options);
        console.log('✅ MoScripts integrated with existing map');
        return window.moscriptsIntegration;
    } else {
        console.warn('❌ Map instance not provided');
        return null;
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MoScriptsIntegration, initializeMoScripts };
}
