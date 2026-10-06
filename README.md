# HydroSense & PluvioScan IoT System

[![Platform](https://img.shields.io/badge/Platform-ESP32-blue.svg)](https://espressif.com/)
[![Sensors](https://img.shields.io/badge/Sensors-3x%20Water%20Level%20%2B%201x%20Disdrometer-teal.svg)](#hardware-wiring)
[![Actuators](https://img.shields.io/badge/LEDs-Green%20%7C%20Yellow%20%7C%20Red%20%7C%20Blue-orange.svg)](#led-indicators)
[![Web Dashboard](https://img.shields.io/badge/Dashboard-Real--time%20Dark%20Glassmorphism-purple.svg)](web_dashboard/)

An advanced hydrological IoT monitoring system designed for the **ESP32 microcontroller**. It combines a **3-tier water depth monitoring array** with a **kinetic raindrop disdrometer** capable of estimating **raindrop diameter** and classifying **rain intensity**, accompanied by a **smart 4-LED status indicator matrix** and a **real-time responsive web dashboard**.

---

## 🌟 Key Highlights

- **3-Tier Water Level Fusion**: Monitors baseline (Tier 1 Low), operating (Tier 2 Mid), and critical overflow (Tier 3 High) levels on independent ADC1 channels.
- **Kinetic Raindrop Disdrometer**: High-frequency sampling (100 Hz) captures individual droplet contact conductance pulses ($\Delta G$), estimating raindrop diameter from **$0.5\text{ mm}$ (drizzle)** to **$6.5\text{ mm}$ (torrential downpour)** using the Marshall-Palmer meteorological model.
- **Dynamic 4-LED Indicator Panel**:
  - 🟢 **Green (GPIO 25)**: Normal / Safe hydrological capacity.
  - 🟡 **Yellow (GPIO 26)**: Caution / Rising water level or light rain in progress.
  - 🔴 **Red (GPIO 27)**: Emergency Alert / Critical tank overflow or violent rainfall.
  - 🔵 **Blue (GPIO 14)**: Rain active indicator & **instantaneous droplet strike strobe** (flashes upon impact).
- **Dual Dashboard Architecture**:
  - **Embedded ESP32 Web Server**: Served straight from ESP32 flash memory (`http://<ESP32_IP>/`).
  - **Standalone Web App (`web_dashboard/`)**: Interactive dark glassmorphism dashboard with fluid liquid reservoir physics, raindrop canvas particle simulation, droplet size distribution histograms, and live time-series charts.

---

## 📐 Pinout & Wiring Map

All analog sensors are connected to **ESP32 ADC1** pins to maintain 100% stability while Wi-Fi is active:

| Hardware Component | Description | ESP32 GPIO |
|---|---|---|
| **Water Level Sensor 1** | Tier 1 (Low Baseline) | **GPIO 34** (ADC1_CH6) |
| **Water Level Sensor 2** | Tier 2 (Medium / Caution) | **GPIO 35** (ADC1_CH7) |
| **Water Level Sensor 3** | Tier 3 (High / Overflow) | **GPIO 32** (ADC1_CH4) |
| **Rain Sensor / Disdrometer** | Sensor 4 (Drop Kinetic Impulse) | **GPIO 33** (ADC1_CH5) |
| **Green LED** | Normal / Safe Water Indicator | **GPIO 25** (220Ω resistor) |
| **Yellow LED** | Caution / Mid Level / Light Rain | **GPIO 26** (220Ω resistor) |
| **Red LED** | Flood Alert / Severe Rain | **GPIO 27** (220Ω resistor) |
| **Blue LED** | Rain Active & Droplet Flash | **GPIO 14** (220Ω resistor) |

*For complete circuit schematics and mathematical derivations, see [CIRCUIT_AND_ALGORITHM_GUIDE.md](CIRCUIT_AND_ALGORITHM_GUIDE.md).*

---

## 🚀 Quick Start Guide

### 1. Flashing the ESP32 Firmware
1. Open [`BRIDGE.ino`](BRIDGE.ino) in the **Arduino IDE**.
2. Select your board: `Tools` > `Board` > `ESP32 Arduino` > `ESP32 Dev Module`.
3. Set your Wi-Fi credentials:
   ```cpp
   const char* WIFI_SSID     = "YOUR_WIFI_SSID";
   const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
   ```
4. Click **Upload**.
5. Open the Serial Monitor at **115200 baud** to view the assigned IP address.
   *(If your home Wi-Fi is unavailable, the device automatically broadcasts a fallback SoftAP: `HydroSense-AP`, password: `watermonitor` at `http://192.168.4.1`).*

---

### 2. Deploying to Vercel (Cloud Telemetry & Upstash Redis)

You can deploy the web dashboard and serverless API to **Vercel** with one click:

1. **Import the Repository into Vercel**:
   - Go to [vercel.com](https://vercel.com) and click **Add New** > **Project**.
   - Select your GitHub repo `hryvd/BRIDGE` and click **Deploy**.
2. **Connect Upstash Redis (Storage)**:
   - In your Vercel project dashboard, click the **Storage** tab.
   - Click **Create Database** (or Connect from Marketplace) > select **Upstash Redis**.
   - Keep default names and connect to **Production**, **Preview**, and **Development**.
3. **Configure API Key (Environment Variables)**:
   - In Vercel, go to **Settings** > **Environment Variables**.
   - Add a key:
     - **Name**: `bridge_key` *(or `API_KEY`)*
     - **Value**: `bridgingthegap`
4. **Redeploy**:
   - Go to **Deployments** > click `...` on the latest deployment > **Redeploy**.
5. **Update your ESP32 Sketch ([`BRIDGE.ino`](BRIDGE.ino))**:
   - In [`BRIDGE.ino`](BRIDGE.ino), set your Vercel address and API key:
     ```cpp
     #define VERCEL_HOST     "your-project.vercel.app"  // (no https://)
     #define VERCEL_API_KEY  "bridgingthegap"
     ```
   - Re-upload to your ESP32. It will automatically POST live telemetry every 3 seconds!

---

### 3. Viewing the Web Dashboard

- **On Vercel**: Visit your deployed URL: `https://your-project.vercel.app/`
  *(Enter your API key into the top header bar and click **Sync**).*
- **Locally**: Open [`index.html`](index.html) in your browser, or run `node web_dashboard/server.js` and visit `http://localhost:3000`.
- **Directly from ESP32**: Visit `http://<ESP32_IP>/` while connected to the same Wi-Fi.

---

## 🔬 Raindrop Diameter Estimation Logic

Individual raindrop diameter $D$ is derived from transient impact conductance spikes:
$$D_{est} = 0.5 + 6.0 \cdot \left(\frac{\Delta ADC}{3000}\right)^{0.55} \text{ mm}$$

Precipitation intensity is classified according to meteorological standards:
- **Light Rain / Drizzle**: $< 2.5\text{ mm/h}$ ($D \approx 0.5 - 2.0\text{ mm}$)
- **Moderate Rain**: $2.5 - 10\text{ mm/h}$ ($D \approx 2.0 - 3.2\text{ mm}$)
- **Heavy Rain**: $10 - 50\text{ mm/h}$ ($D \approx 3.2 - 4.8\text{ mm}$)
- **Torrential Storm**: $> 50\text{ mm/h}$ ($D > 4.8\text{ mm}$)
