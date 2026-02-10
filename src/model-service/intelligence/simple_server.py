"""
Simple Analysis Server - Standalone Backend
==========================================

PURPOSE:
    Simple standalone server for frontend integration testing.
    No complex imports, no dependencies, just analysis outputs.
    
RESPONSIBILITIES:
    - Serve analysis endpoint
    - Handle CORS for frontend
    - Provide health check
    - Generate sample analysis data
    
FORBIDDEN:
    ❌ Complex integration dependencies
    ❌ Database connections
    ❌ Real artifact processing
    
ALLOWED:
    ✅ Serve analysis API
    ✅ Handle CORS requests
    ✅ Provide sample data
    ✅ Read-only operations

Architecture Status: LOCKED
Authority Level: LOW (Presentation Only)
Mode: ANALYSIS_ONLY
"""

from flask import Flask, jsonify
from flask_cors import CORS
import logging
from datetime import datetime
import json

logger = logging.getLogger(__name__)


def create_app():
    """Create Flask application for analysis API."""
    app = Flask(__name__)
    
    # Enable CORS for frontend
    CORS(app)
    
    # Sample analysis data (simulating System 2 outputs)
    SAMPLE_ANALYSIS = {
        "mode": "analysis",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "artifacts_used": ["DetectedTracks", "ForecastCube", "AccumulationGrid"],
        "analysis": [
            {
                "module": "situational_awareness",
                "text": "Current analysis shows 1 detected track present in the Mozambique Channel with moderate intensity.",
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "tags": ["tracks_present", "moderate_intensity"]
            },
            {
                "module": "historical_analog",
                "text": "Similar spatial patterns were observed during Cyclone Idai (2019), though intensity characteristics differ.",
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "tags": ["historical_analog", "cyclone_idai_2019"]
            },
            {
                "module": "threshold_monitor",
                "text": "72-hour precipitation accumulation exceeds the February median for this region.",
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "tags": ["high_accumulation", "february_median_exceeded"]
            }
        ],
        "metadata": {
            "modules_active": ["d1_situational", "d2_historical", "d3_thresholds"],
            "system_mode": "analysis",
            "provenance": "System 2 Analysis Mode"
        }
    }
    
    @app.route('/api/analysis', methods=['GET'])
    def get_analysis():
        """Get latest analysis results."""
        try:
            # Return sample analysis data
            response = SAMPLE_ANALYSIS.copy()
            response["timestamp"] = datetime.utcnow().isoformat() + "Z"
            
            # Update timestamps in analysis items
            for item in response["analysis"]:
                item["timestamp"] = datetime.utcnow().isoformat() + "Z"
            
            logger.info("Served analysis response")
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
            return jsonify({
                "status": "healthy",
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "system_mode": "analysis",
                "modules": {
                    "total_modules": 3,
                    "module_names": ["d1_situational", "d2_historical", "d3_thresholds"],
                    "system_mode": "analysis",
                    "active_analyses": 0
                }
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
            # Return sample history
            history = []
            for i in range(5):
                history_item = SAMPLE_ANALYSIS.copy()
                history_item["timestamp"] = datetime.utcnow().isoformat() + "Z"
                history.append(history_item)
            
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
    
    @app.route('/frontend_example.html')
    def frontend_example():
        """Serve frontend example."""
        try:
            with open('frontend_example.html', 'r') as f:
                return f.read()
        except FileNotFoundError:
            return "Frontend example not found", 404
    
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
                "/api/history",
                "/frontend_example.html"
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
    
    logger.info("Starting Simple Analysis Server on http://localhost:5001")
    logger.info("Available endpoints:")
    logger.info("  GET /api/analysis - Latest analysis results")
    logger.info("  GET /api/health - Health check")
    logger.info("  GET /api/history - Analysis history")
    logger.info("  GET /frontend_example.html - Frontend demo")
    
    app.run(
        host='0.0.0.0',
        port=5001,
        debug=False
    )


# ============================================================================
# CRITICAL REMINDER
# ============================================================================

"""
SIMPLE ANALYSIS SERVER IS READ-ONLY.

This server serves analysis outputs ONLY.
It does NOT:
- Modify analysis content
- Add predictions or authority
- Generate alerts or warnings
- Process real artifacts

If you want to:
- Process real artifacts → Full System 2 Integration
- Generate alerts → System 3 (Alerting Layer) - NOT YET IMPLEMENTED
- Add business logic → Separate service

This server just answers: "What would System 2 analyze?"

Architecture Status: LOCKED
Authority Level: LOW (Presentation Only)
"""
