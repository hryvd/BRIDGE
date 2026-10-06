# HydroSense & PluvioScan IoT System
## Comprehensive Engineering, Circuit & Disdrometer Physics Guide

---

## 1. System Overview

**HydroSense & PluvioScan** is a dual-purpose hydrological IoT platform built around the **ESP32 microcontroller**:
1. **Tiered Water Level Monitoring**: 3 dedicated depth sensors positioned along a vertical water column or reservoir (Low, Medium, High/Overflow).
2. **Kinetic Raindrop Disdrometer**: A high-frequency sampled analog sensor that measures individual droplet impact impulses, calculates **estimated raindrop diameter ($D$ in mm)**, classifies rain intensity (Light, Moderate, Heavy, Torrential), and computes the **Marshall-Palmer droplet size spectrum**.
3. **Smart 4-LED Indicator Array**: Green, Yellow, Red, and Blue LEDs providing instant visual feedback on hydrological risk and kinetic rain strike pulses.
4. **Embedded Web Server & Telemetry API**: ESP32 hosts an onboard responsive dashboard and JSON REST endpoints (`/api/telemetry`), with SoftAP fallback and cross-origin compatibility.

---

## 2. Hardware Pinout & Wiring Specifications

> [!IMPORTANT]
> **ESP32 ADC Restriction**: All analog sensors **MUST** be connected to **ADC1** pins (GPIO 32, 33, 34, 35, 36, 39). **ADC2 cannot be used when Wi-Fi is active**, as the ESP32 Wi-Fi driver shares and locks ADC2 hardware.

### Wiring Table

| Component | Pin / Terminal | ESP32 GPIO | Mode / Notes |
|---|---|---|---|
| **Water Sensor 1 (Low)** | Signal (Analog S) | **GPIO 34** (ADC1_CH6) | Baseline / Tank Minimum (Input) |
| **Water Sensor 2 (Mid)** | Signal (Analog S) | **GPIO 35** (ADC1_CH7) | Caution / Normal Operating Level |
| **Water Sensor 3 (High)** | Signal (Analog S) | **GPIO 32** (ADC1_CH4) | Danger / Overflow Level |
| **Rain Sensor (Disdrometer)** | Signal (Analog S) | **GPIO 33** (ADC1_CH5) | High-speed droplet impact sampling |
| **GREEN LED** | Anode (+) via 220Ω | **GPIO 25** | System Safe / Normal Water Level |
| **YELLOW LED** | Anode (+) via 220Ω | **GPIO 26** | Caution / Mid Level or Light Rain |
| **RED LED** | Anode (+) via 220Ω | **GPIO 27** | Flood Danger / Overflow or Heavy Rain |
| **BLUE LED** | Anode (+) via 220Ω | **GPIO 14** | Rain Active & Droplet Impact Strobe |
| **Common Ground (GND)** | All sensor (-) & LED cathode (-) | **GND** | Star ground layout recommended |
| **Power Supply (VCC)** | Sensor (+) terminals | **3.3V or 5V** | 3.3V recommended for linear ADC scaling |

### Resistor Requirements:
- **LED Current Limiting**: $220\,\Omega$ to $330\,\Omega$ in series with each LED anode.
- **Sensor Pull-downs**: Standard resistive water level sensors provide an internal divider; if using bare copper contact probes, use $10\,\text{k}\Omega$ pull-down resistors to GND.

---

## 3. The Science of Raindrop Diameter Estimation

Traditional rain sensors only detect whether the surface is "wet" or "dry" through simple thresholding. In natural meteorology, understanding **precipitation intensity** requires measuring the **kinetic energy and diameter of individual raindrops**.

```
                Raindrop Falling at Terminal Velocity (v_t)
                                 │
                                 ▼   (Diameter D: 0.5mm - 6.0mm)
                 ╭───────────────────────────────╮
                 │   Impact & Conductance Pulse  │
                 ╰───────────────────────────────╯
                                 │
           ┌─────────────────────┴─────────────────────┐
           ▼                                           ▼
Conductance Jump ΔG                      Spread Area: A ~ π(D/2)²
(Higher voltage pulse ΔV)                (Larger drops bridge multiple traces)
```

### Mathematical Model

1. **Conductance & Contact Area**:
   When a spherical raindrop of diameter $D$ hits the interdigital grid, surface tension spreads the droplet across the conductor tracks. The instantaneous wetting contact area $A_{contact}$ scales with droplet geometry:
   $$A_{contact} \approx \frac{\pi}{4} D^2$$

2. **Conductance Impulse Voltage ($\Delta ADC$)**:
   The instantaneous peak voltage impulse measured by the 12-bit ADC ($0 - 4095$) above baseline $ADC_{base}$ is proportional to contact area and ionic conductance:
   $$\Delta ADC = ADC_{peak} - ADC_{base}$$

3. **Estimated Raindrop Diameter Formula**:
   Calibrated against empirical disdrometer models (Joss-Waldvogel and Marshall-Palmer):
   $$D_{est} = D_{min} + (D_{max} - D_{min}) \cdot \left(\frac{\Delta ADC}{\Delta ADC_{sat}}\right)^{\alpha}$$
   Where:
   - $D_{min} = 0.5\text{ mm}$ (drizzle droplet lower limit)
   - $D_{max} = 6.5\text{ mm}$ (aerodynamic break-up limit of natural raindrops)
   - $\alpha = 0.55$ (sub-linear exponent accounting for hydrodynamic droplet flattening upon impact)
   - $\Delta ADC_{sat} \approx 3000$ (ADC saturation threshold)

### Raindrop Classification Scale

| Diameter ($D$) | Impact Impulse ($\Delta ADC$) | Rain Classification | Typical Weather |
|---|---|---|---|
| **$0.5 - 1.2\text{ mm}$** | $80 - 250$ | Micro-drop / Mist | Fog, Scotch mist |
| **$1.2 - 2.2\text{ mm}$** | $250 - 700$ | Small Drop / Drizzle | Light stratiform drizzle |
| **$2.2 - 3.4\text{ mm}$** | $700 - 1600$ | Medium Droplet | Steady moderate rainfall |
| **$3.4 - 4.8\text{ mm}$** | $1600 - 2600$ | Large Droplet | Heavy convective shower |
| **$> 4.8\text{ mm}$** | $> 2600$ | Giant Droplet | Severe thunderstorm / Cloudburst |

### Precipitation Rate Equation ($R$ in mm/h)
Calculated from the frequency of droplet impacts ($N_{drops}/\text{min}$) and mean droplet diameter ($\bar{D}$):
$$R = k \cdot N_{drops} \cdot \bar{D}^{1.8}$$
- $R < 2.5\text{ mm/h}$: **Light Rain**
- $2.5 \le R < 10\text{ mm/h}$: **Moderate Rain**
- $10 \le R < 50\text{ mm/h}$: **Heavy Rain**
- $R \ge 50\text{ mm/h}$: **Torrential Downpour**

---

## 4. Smart 4-LED Indicator Matrix

| LED Color | GPIO | State Trigger | Visual Pattern |
|---|---|---|---|
| **GREEN** | 25 | Total water level $< 55\%$ AND no heavy rain | Solid ON (All safe) |
| **YELLOW** | 26 | Water level $\in [33\%, 75\%]$ OR Light/Moderate rain active | Solid ON (Caution) |
| **RED** | 27 | Water level $\ge 75\%$ OR Heavy/Torrential rain | Solid ON / Flashing (Critical alert) |
| **BLUE** | 14 | Rain sensor active ($R > 0.4\text{ mm/h}$) | **Dynamic**: Pulses for 40ms on each individual drop impact! |

---

## 5. Web Dashboard Architecture

The system provides two interfaces:
1. **Embedded ESP32 Web Server**:
   - Access directly by navigating to `http://<ESP32_IP>/` in any browser on the same Wi-Fi network.
   - Self-hosted in PROGMEM flash memory.
2. **Standalone Full-Featured Web Application** (`web_dashboard/`):
   - Modern dark glassmorphism user interface.
   - Animated SVG/Canvas liquid reservoir tank.
   - Droplet particle simulation matching real-time precipitation rate and diameter.
   - Live time-series charts for depth and rain rates.
   - Interactive simulation mode with 5 weather test benches.
   - Dual-source toggle: connect directly to ESP32 IP or test locally.
