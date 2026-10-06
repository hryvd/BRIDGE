/*
 * =========================================================================================
 * PROJECT BRIDGE: HYDROSENSE & PLUVIOSCAN IOT SYSTEM FOR ESP32
 * =========================================================================================
 * 3 Water Level Sensors (Tier 1 Low, Tier 2 Mid, Tier 3 High / Overflow)
 * 1 Raindrop Kinetic Disdrometer (Sensor 4) for Raindrop Diameter & Intensity Prediction
 * 4 Status LEDs (Green, Yellow, Red, Blue)
 * Embedded Wi-Fi Web Server & REST API (/api/telemetry, /api/leds)
 * =========================================================================================
 */

#include <WiFi.h>
#include <WebServer.h>

// -------------------------------------------------------------
// Pin Definitions (Using ADC1 Channels - WiFi Safe!)
// -------------------------------------------------------------
const int PIN_WATER_LOW   = 34; // Water Level Tier 1 (Low - ADC1_CH6)
const int PIN_WATER_MID   = 35; // Water Level Tier 2 (Medium - ADC1_CH7)
const int PIN_WATER_HIGH  = 32; // Water Level Tier 3 (High - ADC1_CH4)
const int PIN_RAIN_SENSOR = 33; // Raindrop Disdrometer (ADC1_CH5)

// 4 LED Output Pins
const int PIN_LED_GREEN   = 25; // Normal / Safe Level Indicator
const int PIN_LED_YELLOW  = 26; // Caution / Mid Level or Light Rain
const int PIN_LED_RED     = 27; // Danger / Overflow Alert or Heavy Rain
const int PIN_LED_BLUE    = 14; // Rain Detected & Droplet Impact Strobe

// -------------------------------------------------------------
// WiFi Credentials & AP Fallback
// -------------------------------------------------------------
const char* WIFI_SSID     = "YOUR_WIFI_SSID";     // Replace with your WiFi SSID
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD"; // Replace with your WiFi Password

const char* AP_SSID       = "HydroSense-AP";
const char* AP_PASSWORD   = "watermonitor";

WebServer server(80);

// -------------------------------------------------------------
// Telemetry State
// -------------------------------------------------------------
struct TelemetryData {
  int   rawLow;
  int   rawMid;
  int   rawHigh;
  float waterPercent;
  
  int   rawRain;
  float rainBaseline;
  float peakImpulseMv;
  float dropDiameterMm;    // Estimated raindrop diameter (0.5 - 6.5 mm)
  float avgDiameterMm;
  int   dropCountLastMinute;
  float rainRateMmH;       // Precipitation rate (mm/h)
  String rainClass;        // "Dry", "Light Rain", "Moderate Rain", "Heavy Rain", "Torrential"
  
  bool  ledGreen;
  bool  ledYellow;
  bool  ledRed;
  bool  ledBlue;
  
  int   rssi;
  unsigned long uptimeSeconds;
} telemetry;

unsigned long lastSampleTime     = 0;
unsigned long lastDropStrikeTime = 0;
unsigned long last1SecWindow     = 0;
unsigned long last1MinWindow     = 0;
int currentMinuteDropCount       = 0;
float accumulatedDropDiameter    = 0.0;
unsigned long blueLedOffTime     = 0;

// -------------------------------------------------------------
// Embedded Web Dashboard HTML (Served directly by ESP32)
// -------------------------------------------------------------
const char INDEX_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HydroSense ESP32 Live Telemetry</title>
  <style>
    :root { --bg: #090d16; --card: rgba(18,26,47,0.85); --cyan: #06b6d4; --blue: #3b82f6; --green: #10b981; --yellow: #f59e0b; --red: #ef4444; }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: var(--bg); color: #f8fafc; padding: 20px; display: flex; flex-direction: column; align-items: center; min-height: 100vh; }
    .container { max-width: 900px; width: 100%; display: flex; flex-direction: column; gap: 16px; }
    header { background: var(--card); border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; }
    h1 { font-size: 1.25rem; font-weight: 800; }
    .badge { padding: 4px 10px; border-radius: 99px; font-size: 0.75rem; font-weight: bold; background: rgba(16,185,129,0.2); color: var(--green); border: 1px solid var(--green); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
    .card { background: var(--card); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 18px; display: flex; flex-direction: column; gap: 12px; }
    .val-row { display: flex; align-items: baseline; gap: 4px; }
    .big-num { font-size: 2.2rem; font-weight: 800; color: var(--cyan); }
    .sub { font-size: 0.8rem; color: #94a3b8; }
    .tank-bar { width: 100%; height: 18px; background: rgba(255,255,255,0.08); border-radius: 99px; overflow: hidden; }
    .tank-fill { height: 100%; background: linear-gradient(90deg, var(--cyan), var(--blue)); width: 0%; transition: width 0.4s ease; }
    .leds-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
    .led-box { background: rgba(0,0,0,0.3); border-radius: 10px; padding: 10px; text-align: center; border: 1px solid rgba(255,255,255,0.06); font-size: 0.75rem; }
    .led-dot { width: 16px; height: 16px; border-radius: 50%; margin: 0 auto 6px auto; background: #334155; }
    .led-dot.on-green { background: var(--green); box-shadow: 0 0 12px var(--green); }
    .led-dot.on-yellow { background: var(--yellow); box-shadow: 0 0 12px var(--yellow); }
    .led-dot.on-red { background: var(--red); box-shadow: 0 0 12px var(--red); }
    .led-dot.on-blue { background: var(--blue); box-shadow: 0 0 12px var(--blue); }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>HYDROSENSE &bull; PLUVIOSCAN</h1>
        <p class="sub">ESP32 Smart Water Level & Raindrop Kinetic Disdrometer</p>
      </div>
      <span class="badge" id="net-badge">LIVE ON ESP32</span>
    </header>

    <div class="grid">
      <!-- Water Level -->
      <div class="card">
        <h3>3-Tier Water Level</h3>
        <div class="val-row">
          <span class="big-num" id="water-pct">--</span><span style="font-size:1.2rem;color:#94a3b8;">%</span>
        </div>
        <div class="tank-bar"><div class="tank-fill" id="water-bar"></div></div>
        <p class="sub" id="sensor-breakdown">Low: -- | Mid: -- | High: --</p>
      </div>

      <!-- Rain Disdrometer -->
      <div class="card">
        <h3>Rain Disdrometer</h3>
        <div class="val-row">
          <span class="big-num" id="rain-rate" style="color:var(--blue);">--</span><span style="font-size:1.2rem;color:#94a3b8;">mm/h</span>
        </div>
        <p class="sub" id="rain-class">Status: Measuring...</p>
        <p class="sub">Estimated Drop Diameter: <strong id="drop-dia" style="color:#60a5fa;">--</strong> mm</p>
        <p class="sub">Impact Cadence: <strong id="strike-rate">--</strong> drops/min</p>
      </div>

      <!-- 4 LEDs -->
      <div class="card" style="grid-column: 1 / -1;">
        <h3>Hardware LED Actuators</h3>
        <div class="leds-row">
          <div class="led-box"><div class="led-dot" id="dot-green"></div>GREEN (GPIO 25)<br><span id="txt-green" class="sub">--</span></div>
          <div class="led-box"><div class="led-dot" id="dot-yellow"></div>YELLOW (GPIO 26)<br><span id="txt-yellow" class="sub">--</span></div>
          <div class="led-box"><div class="led-dot" id="dot-red"></div>RED (GPIO 27)<br><span id="txt-red" class="sub">--</span></div>
          <div class="led-box"><div class="led-dot" id="dot-blue"></div>BLUE (GPIO 14)<br><span id="txt-blue" class="sub">--</span></div>
        </div>
      </div>
    </div>
  </div>

  <script>
    async function updateTelemetry() {
      try {
        const res = await fetch('/api/telemetry');
        const d = await res.json();
        
        document.getElementById('water-pct').textContent = Math.round(d.water_pct);
        document.getElementById('water-bar').style.width = d.water_pct + '%';
        document.getElementById('sensor-breakdown').textContent = `L1: ${d.s1_adc} | L2: ${d.s2_adc} | L3: ${d.s3_adc}`;
        
        document.getElementById('rain-rate').textContent = d.rain_rate.toFixed(1);
        document.getElementById('rain-class').textContent = 'Intensity: ' + d.rain_class;
        document.getElementById('drop-dia').textContent = d.drop_diameter.toFixed(1);
        document.getElementById('strike-rate').textContent = d.drops_per_min;
        
        // LEDs
        setLed('green', d.led_green, 'on-green');
        setLed('yellow', d.led_yellow, 'on-yellow');
        setLed('red', d.led_red, 'on-red');
        setLed('blue', d.led_blue, 'on-blue');
      } catch (e) {
        console.error('Fetch error:', e);
      }
    }
    function setLed(id, state, cls) {
      const dot = document.getElementById('dot-' + id);
      const txt = document.getElementById('txt-' + id);
      if (state) { dot.className = 'led-dot ' + cls; txt.textContent = 'ON'; }
      else { dot.className = 'led-dot'; txt.textContent = 'OFF'; }
    }
    setInterval(updateTelemetry, 1000);
    updateTelemetry();
  </script>
</body>
</html>
)rawliteral";

// -------------------------------------------------------------
// REST API Handlers
// -------------------------------------------------------------
void handleRoot() {
  server.send(200, "text/html", INDEX_HTML);
}

void handleTelemetryApi() {
  String json = "{";
  json += "\"water_pct\":" + String(telemetry.waterPercent, 1) + ",";
  json += "\"s1_adc\":" + String(telemetry.rawLow) + ",";
  json += "\"s2_adc\":" + String(telemetry.rawMid) + ",";
  json += "\"s3_adc\":" + String(telemetry.rawHigh) + ",";
  json += "\"rain_rate\":" + String(telemetry.rainRateMmH, 2) + ",";
  json += "\"drop_diameter\":" + String(telemetry.dropDiameterMm, 2) + ",";
  json += "\"avg_diameter\":" + String(telemetry.avgDiameterMm, 2) + ",";
  json += "\"drops_per_min\":" + String(telemetry.dropCountLastMinute) + ",";
  json += "\"rain_class\":\"" + telemetry.rainClass + "\",";
  json += "\"peak_impulse_mv\":" + String(telemetry.peakImpulseMv, 1) + ",";
  json += "\"led_green\":" + String(telemetry.ledGreen ? "true" : "false") + ",";
  json += "\"led_yellow\":" + String(telemetry.ledYellow ? "true" : "false") + ",";
  json += "\"led_red\":" + String(telemetry.ledRed ? "true" : "false") + ",";
  json += "\"led_blue\":" + String(telemetry.ledBlue ? "true" : "false") + ",";
  json += "\"rssi\":" + String(WiFi.RSSI()) + ",";
  json += "\"uptime\":" + String(millis() / 1000);
  json += "}";

  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", json);
}

// -------------------------------------------------------------
// Disdrometer Droplet Diameter & Kinetic Sampling
// -------------------------------------------------------------
void processDisdrometerSampling() {
  int currentAdc = analogRead(PIN_RAIN_SENSOR);
  telemetry.rawRain = currentAdc;

  // Slow baseline drift compensation
  if (abs(currentAdc - telemetry.rainBaseline) < 40) {
    telemetry.rainBaseline = (telemetry.rainBaseline * 0.98) + (currentAdc * 0.02);
  }

  int deltaAdc = currentAdc - (int)telemetry.rainBaseline;

  // Individual raindrop strike trigger (>80 ADC ticks above baseline)
  if (deltaAdc > 80 && (millis() - lastDropStrikeTime > 25)) {
    lastDropStrikeTime = millis();
    currentMinuteDropCount++;

    // Estimated raindrop diameter: D = 0.5 + 6.0 * (delta / max)^0.55 mm
    float normalizedImpulse = constrain((float)deltaAdc / 3000.0f, 0.0f, 1.0f);
    float estimatedDiameter = 0.5f + (6.0f * pow(normalizedImpulse, 0.55f));
    
    telemetry.dropDiameterMm = estimatedDiameter;
    accumulatedDropDiameter += estimatedDiameter;
    telemetry.peakImpulseMv  = (deltaAdc / 4095.0f) * 3300.0f;

    // Flash Blue LED on droplet strike
    digitalWrite(PIN_LED_BLUE, HIGH);
    blueLedOffTime = millis() + 40;
  }

  if (blueLedOffTime > 0 && millis() > blueLedOffTime && !telemetry.ledBlue) {
    digitalWrite(PIN_LED_BLUE, LOW);
    blueLedOffTime = 0;
  }
}

// -------------------------------------------------------------
// 3-Tier Water Level Fusion
// -------------------------------------------------------------
void processWaterLevelSensors() {
  telemetry.rawLow  = analogRead(PIN_WATER_LOW);
  telemetry.rawMid  = analogRead(PIN_WATER_MID);
  telemetry.rawHigh = analogRead(PIN_WATER_HIGH);

  float t1 = constrain((float)telemetry.rawLow  / 3500.0f, 0.0f, 1.0f) * 33.33f;
  float t2 = constrain((float)telemetry.rawMid  / 3500.0f, 0.0f, 1.0f) * 33.33f;
  float t3 = constrain((float)telemetry.rawHigh / 3500.0f, 0.0f, 1.0f) * 33.34f;

  telemetry.waterPercent = t1 + t2 + t3;
}

// -------------------------------------------------------------
// Rain Classification & LED Indicator Logic
// -------------------------------------------------------------
void updateClassificationsAndLeds() {
  telemetry.dropCountLastMinute = currentMinuteDropCount;
  
  if (currentMinuteDropCount > 0) {
    telemetry.avgDiameterMm = accumulatedDropDiameter / currentMinuteDropCount;
    // Precipitation rate R (mm/h) based on Marshall-Palmer parameters
    telemetry.rainRateMmH = (currentMinuteDropCount * 0.06f) * pow(telemetry.avgDiameterMm, 1.8f);
  } else {
    telemetry.rainRateMmH = 0.0f;
    telemetry.avgDiameterMm = 0.0f;
    telemetry.dropDiameterMm = 0.0f;
  }

  // Rain category
  if (telemetry.rainRateMmH == 0.0f) {
    telemetry.rainClass = "Dry (No Rain)";
  } else if (telemetry.rainRateMmH < 2.5f) {
    telemetry.rainClass = "Light Rain / Drizzle";
  } else if (telemetry.rainRateMmH < 10.0f) {
    telemetry.rainClass = "Moderate Rain";
  } else if (telemetry.rainRateMmH < 50.0f) {
    telemetry.rainClass = "Heavy Rain";
  } else {
    telemetry.rainClass = "Torrential Storm";
  }

  // 4-LED Indicator rules
  bool isWaterLow   = (telemetry.waterPercent < 55.0f);
  bool isWaterMid   = (telemetry.waterPercent >= 33.0f && telemetry.waterPercent < 75.0f);
  bool isWaterHigh  = (telemetry.waterPercent >= 75.0f);
  bool isRaining    = (telemetry.rainRateMmH > 0.4f);
  bool isHeavyRain  = (telemetry.rainRateMmH >= 25.0f || telemetry.dropDiameterMm >= 3.8f);

  telemetry.ledGreen  = isWaterLow && !isHeavyRain;
  telemetry.ledYellow = isWaterMid || (isRaining && !isHeavyRain);
  telemetry.ledRed    = isWaterHigh || isHeavyRain;
  telemetry.ledBlue   = isRaining;

  digitalWrite(PIN_LED_GREEN,  telemetry.ledGreen  ? HIGH : LOW);
  digitalWrite(PIN_LED_YELLOW, telemetry.ledYellow ? HIGH : LOW);
  digitalWrite(PIN_LED_RED,    telemetry.ledRed    ? HIGH : LOW);
  
  if (blueLedOffTime == 0) {
    digitalWrite(PIN_LED_BLUE, telemetry.ledBlue ? HIGH : LOW);
  }
}

// -------------------------------------------------------------
// Setup & Configuration
// -------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n--- Project BRIDGE: HydroSense & PluvioScan System ---");

  // Output LEDs
  pinMode(PIN_LED_GREEN, OUTPUT);
  pinMode(PIN_LED_YELLOW, OUTPUT);
  pinMode(PIN_LED_RED, OUTPUT);
  pinMode(PIN_LED_BLUE, OUTPUT);

  // Boot indicator sequence
  digitalWrite(PIN_LED_GREEN, HIGH); delay(120); digitalWrite(PIN_LED_GREEN, LOW);
  digitalWrite(PIN_LED_YELLOW, HIGH); delay(120); digitalWrite(PIN_LED_YELLOW, LOW);
  digitalWrite(PIN_LED_RED, HIGH); delay(120); digitalWrite(PIN_LED_RED, LOW);
  digitalWrite(PIN_LED_BLUE, HIGH); delay(120); digitalWrite(PIN_LED_BLUE, LOW);

  // Input Sensors
  pinMode(PIN_WATER_LOW, INPUT);
  pinMode(PIN_WATER_MID, INPUT);
  pinMode(PIN_WATER_HIGH, INPUT);
  pinMode(PIN_RAIN_SENSOR, INPUT);

  // Baseline calibration
  int sum = 0;
  for (int i = 0; i < 30; i++) {
    sum += analogRead(PIN_RAIN_SENSOR);
    delay(10);
  }
  telemetry.rainBaseline = sum / 30.0f;

  // Wi-Fi
  Serial.print("Connecting to: "); Serial.println(WIFI_SSID);
  WiFi.mode(WIFI_AP_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long startT = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - startT < 8000)) {
    delay(250);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("\nWiFi Connected! IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nWiFi unreachable. Starting SoftAP 'HydroSense-AP'...");
    WiFi.softAP(AP_SSID, AP_PASSWORD);
    Serial.print("SoftAP IP: ");
    Serial.println(WiFi.softAPIP());
  }

  server.on("/", handleRoot);
  server.on("/api/telemetry", handleTelemetryApi);
  server.begin();
  Serial.println("Web server started.");
}

// -------------------------------------------------------------
// Main Loop
// -------------------------------------------------------------
void loop() {
  server.handleClient();

  // 100 Hz Raindrop Impulse Sampling
  if (millis() - lastSampleTime >= 10) {
    lastSampleTime = millis();
    processDisdrometerSampling();
  }

  // 1 Hz Hydrology & LED State Refresh
  if (millis() - last1SecWindow >= 1000) {
    last1SecWindow = millis();
    processWaterLevelSensors();
    updateClassificationsAndLeds();
  }

  // 60-Second sliding window reset
  if (millis() - last1MinWindow >= 60000) {
    last1MinWindow = millis();
    currentMinuteDropCount = 0;
    accumulatedDropDiameter = 0;
  }
}