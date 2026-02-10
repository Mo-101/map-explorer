"""
Analysis Server - Frontend Integration
====================================

PURPOSE:
    Simple HTTP server to expose analysis API to frontend.
    No complex routing, no authentication, no business logic.
    
RESPONSIBILITIES:
    - Serve analysis endpoint
    - Handle CORS for frontend
    - Provide health check
    - Maintain read-only access
    
FORBIDDEN:
    ❌ Modify analysis outputs
    ❌ Add authentication or business logic
    ❌ Generate alerts or warnings
    ❌ Bypass Integration Shim
    
ALLOWED:
    ✅ Serve analysis API
    ✅ Handle CORS requests
    ✅ Provide health status
    ✅ Read-only operations

Architecture Status: LOCKED
Authority Level: LOW (Presentation Only)
Mode: ANALYSIS_ONLY
"""

from flask import Flask, jsonify
from flask_cors import CORS
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

# Import with error handling
try:
    from .api import AnalysisAPI
    from .dispatcher import AnalysisDispatcher
except ImportError:
    # Fallback for direct execution
    from api import AnalysisAPI
    from dispatcher import AnalysisDispatcher

# Mock integration components for testing
class MockArtifactRegistry:
    def __init__(self):
        pass

class MockArtifactAccessAPI:
    def __init__(self, registry):
        self.registry = registry


def create_app():
    """Create Flask application for analysis API."""
    app = Flask(__name__)
    
    # Enable CORS for frontend
    CORS(app)
    
    # Initialize components
    try:
        # Create Integration Shim components
        registry = MockArtifactRegistry()
        access_api = MockArtifactAccessAPI(registry)
        
        # Create System 2 components
        dispatcher = AnalysisDispatcher(access_api, 'analysis')
        api = AnalysisAPI(dispatcher)
        
        # Store components in app context
        app.config['ANALYSIS_API'] = api
        app.config['DISPATCHER'] = dispatcher
        
        logger.info("Analysis server initialized successfully")
        
    except Exception as e:
        logger.error(f"Failed to initialize analysis server: {e}")
        raise
    
    @app.route('/api/analysis', methods=['GET'])
    def get_analysis():
        """Get latest analysis results."""
        try:
            api = app.config['ANALYSIS_API']
            response = api.get_latest_analysis()
            return jsonify(response)
            
        except Exception as e:
            logger.error(f"Analysis endpoint error: {e}")
            return jsonify({
                "mode": "analysis",
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "artifacts_used": [],
                "analysis": [
                    {
                        "module": "system",
                        "text": "Analysis temporarily unavailable.",
                        "timestamp": datetime.utcnow().isoformat() + "Z",
                        "tags": ["error"]
                    }
                ],
                "metadata": {
                    "modules_active": [],
                    "system_mode": "analysis",
                    "provenance": "System 2 Analysis Mode"
                }
            }), 500
    
    @app.route('/api/health', methods=['GET'])
    def health_check():
        """Health check endpoint."""
        try:
            dispatcher = app.config['DISPATCHER']
            status = dispatcher.get_module_status()
            
            return jsonify({
                "status": "healthy",
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "system_mode": "analysis",
                "modules": status
            })
            
        except Exception as e:
            logger.error(f"Health check error: {e}")
            return jsonify({
                "status": "unhealthy",
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "error": str(e)
            }), 500
    
    @app.route('/api/history', methods=['GET'])
    def get_history():
        """Get analysis history."""
        try:
            api = app.config['ANALYSIS_API']
            limit = int(request.args.get('limit', 10))
            history = api.get_analysis_history(limit)
            
            return jsonify({
                "mode": "analysis",
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "history": history,
                "count": len(history)
            })
            
        except Exception as e:
            logger.error(f"History endpoint error: {e}")
            return jsonify({
                "mode": "analysis",
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "history": [],
                "error": str(e)
            }), 500
    
    @app.errorhandler(404)
    def not_found(error):
        """Handle 404 errors."""
        return jsonify({
            "mode": "analysis",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "error": "Endpoint not found",
            "available_endpoints": [
                "/api/analysis",
                "/api/health",
                "/api/history"
            ]
        }), 404
    
    @app.errorhandler(500)
    def internal_error(error):
        """Handle 500 errors."""
        return jsonify({
            "mode": "analysis",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "error": "Internal server error"
        }), 500
    
    return app


if __name__ == "__main__":
    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Create and run app
    app = create_app()
    
    logger.info("Starting Analysis Server on http://localhost:5001")
    logger.info("Available endpoints:")
    logger.info("  GET /api/analysis - Latest analysis results")
    logger.info("  GET /api/health - Health check")
    logger.info("  GET /api/history - Analysis history")
    
    app.run(
        host='0.0.0.0',
        port=5001,
        debug=False
    )


# ============================================================================
# CRITICAL REMINDER
# ============================================================================

"""
ANALYSIS SERVER IS READ-ONLY.

This server serves analysis outputs ONLY.
It does NOT:
- Modify analysis content
- Add predictions or authority
- Generate alerts or warnings
- Implement business logic

If you want to:
- Modify analysis → System 2 (Analysis Layer)
- Generate alerts → System 3 (Alerting Layer) - NOT YET IMPLEMENTED
- Add business logic → Separate service

This server just answers: "What did System 2 analyze?"

Architecture Status: LOCKED
Authority Level: LOW (Presentation Only)
"""
