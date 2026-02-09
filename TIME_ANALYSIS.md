# 🔥 MAPTILER TIME ANALYSIS
## ================================

## 📊 **CURRENT SYSTEM:**

### **MapTiler Weather Layers:**
- **Data Source:** MapTiler Weather API
- **Forecast Range:** Typically 0-96 hours (4 days) for most providers
- **Time Steps:** Usually hourly or 3-hourly intervals
- **Animation:** Real-time playback through forecast period

### **Time Slider Implementation:**
```typescript
// From useWeatherLayers.ts
const startDate = weatherLayer.getAnimationStartDate();
const endDate = weatherLayer.getAnimationEndDate();
setSliderMin(+startDate);  // Unix timestamp
setSliderMax(+endDate);    // Unix timestamp
setSliderValue(+currentDate); // Current position in timeline
```

## 🎯 **KEY INSIGHTS:**

### **1. Forecast Timeline:**
- **MapTiler provides 4-day forecasts** (96 hours)
- **Time slider shows full forecast period**
- **Current date = 10th** (today)
- **Slider range should be:** Feb 10 → Feb 14 (4 days)

### **2. Threat Data vs Weather Data:**
- **Threats:** Real-time detection (GraphCast anomalies)
- **Weather:** Forecast data (MapTiler predictions)
- **Connection:** Threats should correlate with weather conditions

### **3. Time Synchronization:**
- **Problem:** Threat data shows "now" but weather shows "forecast"
- **Solution:** Align threat timestamps with weather timeline

## 🔧 **RECOMMENDATIONS:**

### **1. Check Time Range:**
```javascript
// In browser console
// Check what dates the time slider shows
console.log('Slider Min:', new Date(sliderMin * 1000));
console.log('Slider Max:', new Date(sliderMax * 1000));
console.log('Slider Current:', new Date(sliderValue * 1000));
console.log('Today:', new Date());
```

### **2. Threat Timestamp Alignment:**
```typescript
// Threat data should include forecast time
threat: {
  id: "cyclone-001",
  threat_type: "cyclone",
  center_lat: -18.6,
  center_lng: 45.1,
  forecast_time: "2026-02-10T12:00:00Z",  // When threat is predicted
  detection_time: "2026-02-10T01:32:44Z", // When detected now
  valid_until: "2026-02-14T12:00:00Z"   // Threat validity period
}
```

### **3. MapTiler Data Investigation:**
```bash
# Check MapTiler API response
curl "https://api.maptiler.com/weather/tiles/wind/{z}/{x}/{y}.png?key=YOUR_KEY&time=2026-02-10T12:00"

# Check time range in response
# Look for "time" parameter availability
```

## 🎯 **EXPECTED BEHAVIOR:**

### **Time Slider Should Show:**
- **Min:** Feb 10, 00:00 UTC (start of forecast)
- **Max:** Feb 14, 00:00 UTC (end of 4-day forecast)
- **Current:** Feb 10, current time
- **Animation:** Play through 96 hours of forecast data

### **Threat Display Should:**
- **Real-time threats** at current time
- **Forecast threats** at future times
- **Timeline correlation** between weather patterns and threat development

## 🚨 **POTENTIAL ISSUES:**

### **Issue #1: Time Range Too Small**
**Symptom:** Slider only shows few hours
**Fix:** Check MapTiler configuration for full 96-hour range

### **Issue #2: Wrong Date Format**
**Symptom:** Slider shows Unix timestamps incorrectly
**Fix:** Ensure proper millisecond conversion

### **Issue #3: MapTiler API Limits**
**Symptom:** Only getting current weather, not forecast
**Fix:** Check API key permissions and endpoints

## 🔍 **DEBUGGING STEPS:**

### **Step 1: Check Time Slider**
```javascript
// In browser console
document.querySelector('.slider')?.addEventListener('change', (e) => {
    console.log('Slider value:', e.target.value);
    console.log('Date:', new Date(e.target.value * 1000));
});
```

### **Step 2: Check Weather Layer Times**
```javascript
// Get weather layer time info
const windLayer = map.getLayer('wind');
if (windLayer) {
    console.log('Layer times:', windLayer.getAnimationTimeDate());
}
```

### **Step 3: Check Threat Timeline**
```javascript
// Compare threat times with weather times
threats.forEach(threat => {
    console.log('Threat time:', threat.created_at);
    console.log('Weather time:', new Date(sliderValue * 1000));
    console.log('Time diff:', new Date(threat.created_at) - new Date(sliderValue * 1000));
});
```

## 🎊 **NEXT ACTIONS:**

1. **Verify MapTiler forecast range** (should be 4 days)
2. **Check time slider implementation** (should show 96 hours)
3. **Align threat timestamps** with weather timeline
4. **Add forecast threat predictions** based on weather patterns
5. **Implement time-based threat filtering** (show threats at selected time)

## 🔥 **BROTHER'S QUESTION ANALYSIS:**

> "when is it always updated because we nin 10th, i know the maptiler is a four day forcast?"

**You're absolutely correct!** The system should:

1. **Show 4-day forecast** (Feb 10-14)
2. **Update threats** based on weather patterns at each time
3. **Correlate** current threats with forecast conditions
4. **Animate** through timeline to see threat evolution

**The time slider should definitely show a 4-day range, not just today!**
