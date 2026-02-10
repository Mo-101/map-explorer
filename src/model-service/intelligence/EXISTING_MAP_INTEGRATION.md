# MoScripts Integration for Existing Maps

## 🔥 **ADD TO YOUR EXISTING MAP**

**Brother, here's how to add the MoScripts card to your existing map with weather layers.**

---

## 🎯 **SIMPLE INTEGRATION**

### **✅ Step 1: Add Script to Your Map Page**
```html
<!-- Add to your existing map HTML -->
<script src="path/to/moscripts_integration.js"></script>
```

### **✅ Step 2: Initialize After Map Loads**
```javascript
// After your map is initialized
const moscriptsCard = initializeMoScripts(yourMapInstance, {
    position: 'bottom-right',
    apiUrl: 'http://localhost:5001/api/analysis'
});
```

---

## 🗺️ **COMPATIBLE MAP LIBRARIES**

### **✅ Leaflet Integration:**
```javascript
// Your existing Leaflet map
const map = L.map('map').setView([0, 0], 2);

// Add MoScripts card
const moscriptsCard = initializeMoScripts(map, {
    position: 'bottom-right'
});
```

### **✅ OpenLayers Integration:**
```javascript
// Your existing OpenLayers map
const map = new ol.Map({
    target: 'map',
    layers: [/* your layers */],
    view: new ol.View({
        center: [0, 0],
        zoom: 2
    })
});

// Add MoScripts card
const moscriptsCard = initializeMoScripts(map, {
    position: 'bottom-right'
});
```

### **✅ Mapbox GL JS Integration:**
```javascript
// Your existing Mapbox map
const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/your-style',
    center: [0, 0],
    zoom: 2
});

// Add MoScripts card
const moscriptsCard = initializeMoScripts(map, {
    position: 'bottom-right'
});
```

---

## 🛡️ **PRESERVES EXISTING FUNCTIONALITY**

### **✅ What Stays the Same:**
- **All weather layers** - No modification
- **Map controls** - Zoom, pan, layers
- **Interactivity** - Click, hover, selection
- **Performance** - No impact on map rendering
- **Styling** - Existing map styles preserved

### **✅ What Gets Added:**
- **Analysis card** - Bottom right overlay
- **Toggle button** - Show/hide functionality
- **Refresh button** - Manual data refresh
- **Auto-refresh** - Every 5 minutes

---

## 🔧 **CUSTOMIZATION OPTIONS**

### **✅ Position Options:**
```javascript
const moscriptsCard = initializeMoScripts(yourMap, {
    position: 'bottom-right', // or 'bottom-left', 'top-right', 'top-left'
    apiUrl: 'http://localhost:5001/api/analysis',
    refreshInterval: 300000, // 5 minutes
    zIndex: 1000
});
```

### **✅ Styling Customization:**
```css
/* Override card styles */
#moscripts-card {
    width: 420px; /* Wider card */
    background: rgba(255, 255, 255, 0.98); /* More opaque */
    border-radius: 12px; /* More rounded */
}
```

---

## 🚀 **LIVE DEMO**

### **✅ Test Integration:**
1. **Start Backend**: `python simple_server.py`
2. **Add Script**: Include `moscripts_integration.js`
3. **Initialize**: Call `initializeMoScripts(yourMap)`
4. **View Card**: Bottom right corner appears

---

## 📱 **RESPONSIVE DESIGN**

### **✅ Mobile Adaptation:**
- **Full width** on screens < 768px
- **Adjusted margins** for mobile
- **Touch-friendly** buttons
- **Readable text** at all sizes

---

## 🔍 **API INTEGRATION**

### **✅ Live Endpoint:**
```
GET http://localhost:5001/api/analysis
```

### **✅ Response Format:**
```json
{
  "mode": "analysis",
  "timestamp": "2026-02-10T22:22:40.748622Z",
  "artifacts_used": ["DetectedTracks", "ForecastCube"],
  "analysis": [
    {
      "module": "situational_awareness",
      "text": "Current analysis shows 1 detected track present...",
      "timestamp": "2026-02-10T22:22:40.748622Z",
      "tags": ["tracks_present"]
    }
  ],
  "metadata": {
    "system_mode": "analysis",
    "provenance": "System 2 Analysis Mode"
  }
}
```

---

## 🎯 **VALIDATION GOALS**

### **✅ What This Tests:**
1. **User understanding** - Do they grasp analysis without authority?
2. **Question quality** - Do they ask better questions?
3. **Language perception** - Does it feel responsible, not scary?
4. **Clarity needs** - Where do they want more context?

---

## 🔥 **SUCCESS METRICS**

### **✅ Positive Indicators:**
- Users linger on the card
- Questions about data sources
- Requests for more context
- Trust in analysis accuracy

### **❌ Warning Signs:**
- Demands for alerts
- Questions about "risk level"
- Requests for predictions
- Anxiety about current conditions

---

## 🚀 **DEPLOYMENT READY**

### **✅ Files Needed:**
- `moscripts_integration.js` - Integration script
- Backend API - Live at `http://localhost:5001`

### **✅ Integration Steps:**
1. **Copy** `moscripts_integration.js` to your project
2. **Include** script in your map HTML
3. **Initialize** after map loads
4. **Test** with live data

---

## 🔒 **CRITICAL REMINDER**

**This adds analysis without disrupting your existing map:**
- **No weather layer changes**
- **No map control modifications**
- **No performance impact**
- **No styling conflicts**

**The MoScripts card creates a thinking surface alongside your weather visualization!**

---

*Status: ✅ READY FOR EXISTING MAPS*
*Integration: SIMPLE AND SAFE*
*Weather Layers: PRESERVED*
*Next: USER VALIDATION*
