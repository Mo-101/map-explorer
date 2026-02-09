#!/bin/bash

# =============================================================================
# AFRO STORM API ENDPOINT TESTER
# =============================================================================
# Tests all 18 endpoints and reports which are working/broken
#
# Usage: bash test_all_endpoints.sh
# =============================================================================

API_BASE="http://localhost:8000"
PASSED=0
FAILED=0
ERRORS=()

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "════════════════════════════════════════════════════════════════"
echo "🔥 AFRO STORM - API ENDPOINT COMPREHENSIVE TEST"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Testing API Base: $API_BASE"
echo ""

# Function to test GET endpoint
test_get() {
    local endpoint=$1
    local name=$2
    
    echo -n "Testing: $name ... "
    
    response=$(curl -s -w "\n%{http_code}" "$API_BASE$endpoint")
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ]; then
        echo -e "${GREEN}✅ PASS${NC} (200 OK)"
        ((PASSED++))
        
        # Show preview of response
        if [ ! -z "$body" ]; then
            echo "   Response preview: $(echo "$body" | jq -c '.' 2>/dev/null | head -c 80)..."
        fi
    else
        echo -e "${RED}❌ FAIL${NC} (HTTP $http_code)"
        ((FAILED++))
        ERRORS+=("$name: HTTP $http_code - $endpoint")
        
        # Show error details
        if [ ! -z "$body" ]; then
            echo "   Error: $(echo "$body" | jq -r '.detail // .error // .' 2>/dev/null | head -c 200)"
        fi
    fi
    echo ""
}

# Function to test POST endpoint
test_post() {
    local endpoint=$1
    local name=$2
    local data=$3
    
    echo -n "Testing: $name ... "
    
    response=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -H "X-API-Key: afro-storm-2025-secure-key" \
        -d "$data" \
        "$API_BASE$endpoint")
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
        echo -e "${GREEN}✅ PASS${NC} (HTTP $http_code)"
        ((PASSED++))
    else
        echo -e "${RED}❌ FAIL${NC} (HTTP $http_code)"
        ((FAILED++))
        ERRORS+=("$name: HTTP $http_code - $endpoint")
        
        if [ ! -z "$body" ]; then
            echo "   Error: $(echo "$body" | jq -r '.detail // .error // .' 2>/dev/null | head -c 200)"
        fi
    fi
    echo ""
}

echo "════════════════════════════════════════════════════════════════"
echo "📋 TESTING ALL 18 ENDPOINTS"
echo "════════════════════════════════════════════════════════════════"
echo ""

# =============================================================================
# GET ENDPOINTS
# =============================================================================

# 1. Default endpoint
test_get "/openapi.json" "OpenAPI Spec"

# 2. Health endpoints
test_get "/health" "Health Check (Root)"
test_get "/api/v1/health" "Health Check (V1)"
test_get "/api/v1/" "Health Check (V1 Root)"

# 3. Debug
test_get "/api/v1/debug/db" "Database Debug"

# 4. Threats endpoints
test_get "/api/v1/threats" "Get Threats"
test_get "/api/v1/threats?limit=5" "Get Threats (with limit)"
test_get "/api/v1/afro-storm/threats" "Get Threats Alias"

# 5. Pipeline
test_get "/api/v1/pipeline/status" "Pipeline Status"

# 6. Forecast
test_get "/api/v1/forecast/runs" "List Forecast Runs"
test_get "/api/v1/forecast/fields?run_id=1" "List Forecast Fields"

# 7. GraphCast
test_get "/api/v1/graphcast/status" "GraphCast Status"
test_get "/api/v1/graphcast/runs" "List GraphCast Runs"

# 8. Weather
test_get "/api/v1/weather/anomalies" "Weather Anomalies"
test_get "/api/v1/weather/current?lat=-20&lon=45" "Current Weather"

# =============================================================================
# POST ENDPOINTS
# =============================================================================

# 9. Push Threats
test_post "/api/v1/afro-storm/threats" "Push Threats Alias" '{
  "threats": [
    {
      "id": "test-001",
      "threat_type": "cyclone",
      "center_lat": -19.5,
      "center_lng": 47.25,
      "timestamp": "2024-02-10T00:00:00Z",
      "detection_details": {
        "wind_speed": 85,
        "confidence": 0.95
      }
    }
  ]
}'

# 10. GraphCast Ingestion
test_post "/api/v1/graphcast/ingest" "Trigger GraphCast Ingestion" '{}'

# 11. Inference
test_post "/infer" "Run Inference (Root)" '{
  "region": "madagascar",
  "fields": ["wind_speed", "pressure"],
  "timestamp": "2024-02-10T00:00:00Z"
}'

test_post "/api/v1/infer" "Run Inference (V1)" '{
  "region": "madagascar",
  "fields": ["wind_speed", "pressure"],
  "timestamp": "2024-02-10T00:00:00Z"
}'

# 12. AI Analyze
test_post "/api/v1/ai/analyze" "AI Analyze" '{
  "prompt": "What is the current cyclone threat level in Madagascar?"
}'

# =============================================================================
# SUMMARY
# =============================================================================

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "📊 TEST SUMMARY"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo -e "${GREEN}✅ PASSED:${NC} $PASSED endpoints"
echo -e "${RED}❌ FAILED:${NC} $FAILED endpoints"
echo ""

if [ $FAILED -gt 0 ]; then
    echo "════════════════════════════════════════════════════════════════"
    echo "❌ FAILED ENDPOINTS DETAILS:"
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    for error in "${ERRORS[@]}"; do
        echo -e "${RED}✗${NC} $error"
    done
    echo ""
    
    echo "════════════════════════════════════════════════════════════════"
    echo "🔧 RECOMMENDED FIXES:"
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    
    # Specific fix recommendations based on common failures
    for error in "${ERRORS[@]}"; do
        if [[ $error == *"graphcast"* ]]; then
            echo "📌 GraphCast Issues:"
            echo "   - Check if GraphCast module is properly imported"
            echo "   - Verify relative imports fixed (no parent package error)"
            echo "   - Run: python -c 'from weather_anomaly_detection import *'"
            echo ""
        fi
        
        if [[ $error == *"502"* ]] || [[ $error == *"Database"* ]]; then
            echo "📌 Database Issues:"
            echo "   - Check Azure Postgres DNS resolution"
            echo "   - Run: nslookup afro-server.postgres.database.azure.com"
            echo "   - Verify PGDATABASE_URL in .env"
            echo ""
        fi
        
        if [[ $error == *"500"* ]]; then
            echo "📌 Internal Server Errors:"
            echo "   - Check backend logs: tail -f src/model-service/app.log"
            echo "   - Look for Python tracebacks in terminal"
            echo ""
        fi
        
        if [[ $error == *"404"* ]]; then
            echo "📌 Endpoint Not Found:"
            echo "   - Verify endpoint is defined in app.py"
            echo "   - Check route decorators match exactly"
            echo ""
        fi
    done
fi

echo "════════════════════════════════════════════════════════════════"
echo "🎯 DETAILED TESTING COMMANDS:"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "To test individual endpoints manually:"
echo ""
echo "# Health check"
echo "curl http://localhost:8000/api/v1/health | jq"
echo ""
echo "# Threats with pretty print"
echo "curl http://localhost:8000/api/v1/threats | jq"
echo ""
echo "# GraphCast status"
echo "curl http://localhost:8000/api/v1/graphcast/status | jq"
echo ""
echo "# Weather anomalies"
echo "curl http://localhost:8000/api/v1/weather/anomalies | jq"
echo ""
echo "# Database debug"
echo "curl http://localhost:8000/api/v1/debug/db | jq"
echo ""

if [ $FAILED -eq 0 ]; then
    echo "════════════════════════════════════════════════════════════════"
    echo -e "${GREEN}🎉 ALL ENDPOINTS WORKING! SYSTEM OPERATIONAL!${NC}"
    echo "════════════════════════════════════════════════════════════════"
    exit 0
else
    echo "════════════════════════════════════════════════════════════════"
    echo -e "${RED}⚠️  SYSTEM HAS $FAILED BROKEN ENDPOINTS${NC}"
    echo "════════════════════════════════════════════════════════════════"
    exit 1
fi
