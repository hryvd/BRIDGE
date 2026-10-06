// HydroSense & PluvioScan IoT Dashboard Logic
// Supports both direct ESP32 hardware telemetry & interactive simulation mode

class HydroSenseDashboard {
  constructor() {
    this.mode = 'cloud'; // 'cloud', 'live', or 'sim'
    this.esp32Ip = localStorage.getItem('bridge_esp32_ip') || '192.168.4.1';
    this.apiKey = localStorage.getItem('bridge_api_key') || 'bridgingthegap';
    this.cloudHost = localStorage.getItem('bridge_cloud_host') || (window.location.origin.includes('http') ? window.location.origin : '');
    this.pollInterval = null;

    // Telemetry State
    this.state = {
      waterPercent: 42,
      sensor1: 3820, // 0-4095 (Low)
      sensor2: 2450, // 0-4095 (Mid)
      sensor3: 120,  // 0-4095 (High)
      rainRate: 8.4, // mm/h
      dropDiameter: 2.8, // mm
      strikeRate: 142, // drops/minute
      peakImpulseMv: 620, // mV
      ledGreen: true,
      ledYellow: true,
      ledRed: false,
      ledBlue: true,
      rssi: -58,
      uptimeSeconds: 9858
    };

    // Telemetry History for Chart
    this.history = {
      labels: [],
      water: [],
      rain: [],
      diameter: [],
      maxPoints: 40
    };

    this.initElements();
    this.initRainCanvas();
    this.initChart();
    this.bindEvents();
    this.startLoop();
  }

  initElements() {
    // Buttons & Modes
    this.btnCloud = document.getElementById('btn-mode-cloud');
    this.btnLive = document.getElementById('btn-mode-live');
    this.btnSim = document.getElementById('btn-mode-sim');
    this.apiKeyInput = document.getElementById('api-key-input');
    this.ipInput = document.getElementById('esp32-ip-input');
    this.btnConnect = document.getElementById('btn-connect-esp32');
    this.statusBadge = document.getElementById('system-status-badge');
    this.statusText = document.getElementById('connection-status-text');

    if (this.apiKeyInput) this.apiKeyInput.value = this.apiKey;
    if (this.ipInput && this.cloudHost) this.ipInput.value = this.cloudHost;

    // Weather Banner
    this.weatherBanner = document.getElementById('weather-alert-banner');
    this.alertTitle = document.getElementById('alert-title');
    this.alertDesc = document.getElementById('alert-desc');
    this.rainCatBadge = document.getElementById('rain-category-badge');
    this.floodRiskBadge = document.getElementById('flood-risk-badge');

    // Water Level Elements
    this.tankLiquid = document.getElementById('tank-liquid-fill');
    this.totalWaterPct = document.getElementById('total-water-pct');
    this.waterStateTag = document.getElementById('water-state-tag');
    this.valS1 = document.getElementById('val-s1');
    this.valS2 = document.getElementById('val-s2');
    this.valS3 = document.getElementById('val-s3');
    this.markerS1 = document.getElementById('marker-s1');
    this.markerS2 = document.getElementById('marker-s2');
    this.markerS3 = document.getElementById('marker-s3');
    this.tier1Bar = document.getElementById('tier-1-bar');
    this.tier2Bar = document.getElementById('tier-2-bar');
    this.tier3Bar = document.getElementById('tier-3-bar');
    this.tier1Raw = document.getElementById('tier-1-raw');
    this.tier2Raw = document.getElementById('tier-2-raw');
    this.tier3Raw = document.getElementById('tier-3-raw');

    // Rain Disdrometer Elements
    this.dropDiameterVal = document.getElementById('drop-diameter-val');
    this.dropDiameterClass = document.getElementById('drop-diameter-class');
    this.dropletSphere = document.getElementById('droplet-sphere-visual');
    this.rainRateVal = document.getElementById('rain-rate-val');
    this.rainRateClass = document.getElementById('rain-rate-classification');
    this.strikeRateVal = document.getElementById('strike-rate-val');
    this.strikeRateSubtext = document.getElementById('strike-rate-subtext');

    // Spectrum Bins
    this.binMist = document.getElementById('bin-mist');
    this.binDrizzle = document.getElementById('bin-drizzle');
    this.binModerate = document.getElementById('bin-moderate');
    this.binHeavy = document.getElementById('bin-heavy');
    this.binGiant = document.getElementById('bin-giant');
    this.binMistPct = document.getElementById('bin-mist-pct');
    this.binDrizzlePct = document.getElementById('bin-drizzle-pct');
    this.binModeratePct = document.getElementById('bin-moderate-pct');
    this.binHeavyPct = document.getElementById('bin-heavy-pct');
    this.binGiantPct = document.getElementById('bin-giant-pct');

    // LEDs
    this.ledLampGreen = document.getElementById('led-lamp-green');
    this.ledLampYellow = document.getElementById('led-lamp-yellow');
    this.ledLampRed = document.getElementById('led-lamp-red');
    this.ledLampBlue = document.getElementById('led-lamp-blue');
    this.ledCardGreen = document.getElementById('led-card-green');
    this.ledCardYellow = document.getElementById('led-card-yellow');
    this.ledCardRed = document.getElementById('led-card-red');
    this.ledCardBlue = document.getElementById('led-card-blue');
    this.ledStateGreen = document.getElementById('led-state-green');
    this.ledStateYellow = document.getElementById('led-state-yellow');
    this.ledStateRed = document.getElementById('led-state-red');
    this.ledStateBlue = document.getElementById('led-state-blue');

    // Simulation Sliders
    this.simWater = document.getElementById('sim-water-level');
    this.simRain = document.getElementById('sim-rain-rate');
    this.simDia = document.getElementById('sim-drop-dia');
    this.simWaterLabel = document.getElementById('sim-water-label');
    this.simRainLabel = document.getElementById('sim-rain-label');
    this.simDiaLabel = document.getElementById('sim-dia-label');
    this.presetButtons = document.querySelectorAll('.preset-btn');

    // Diagnostics
    this.statUptime = document.getElementById('stat-uptime');
    this.statRssi = document.getElementById('stat-rssi');
    this.logTerminal = document.getElementById('log-terminal');
    this.btnClearLogs = document.getElementById('btn-clear-logs');
  }

  bindEvents() {
    if (this.btnCloud) this.btnCloud.addEventListener('click', () => this.setMode('cloud'));
    if (this.btnLive) this.btnLive.addEventListener('click', () => this.setMode('live'));
    if (this.btnSim) this.btnSim.addEventListener('click', () => this.setMode('sim'));

    this.btnConnect.addEventListener('click', () => {
      if (this.apiKeyInput) {
        this.apiKey = this.apiKeyInput.value.trim();
        localStorage.setItem('bridge_api_key', this.apiKey);
      }
      const rawHost = this.ipInput.value.trim();
      if (rawHost) {
        if (this.mode === 'cloud') {
          this.cloudHost = rawHost.startsWith('http') ? rawHost : `https://${rawHost}`;
          localStorage.setItem('bridge_cloud_host', this.cloudHost);
        } else {
          this.esp32Ip = rawHost;
          localStorage.setItem('bridge_esp32_ip', this.esp32Ip);
        }
      }

      this.log(`Sync settings saved (API Key: ${this.apiKey ? '••••••' : 'None'}). Initiating sync...`, 'info');
      if (this.mode === 'cloud') this.fetchCloudData();
      else if (this.mode === 'live') this.fetchEsp32Data();
    });

    // Preset Buttons
    this.presetButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        this.presetButtons.forEach(b => b.classList.remove('active-preset'));
        btn.classList.add('active-preset');
        this.applyPreset(btn.dataset.preset);
      });
    });

    // Simulation Sliders
    this.simWater.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.simWaterLabel.textContent = `${val}%`;
      this.state.waterPercent = val;
      this.recalculateSensors();
      this.render();
    });

    this.simRain.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.simRainLabel.textContent = `${val} mm/h`;
      this.state.rainRate = val;
      if (val === 0) {
        this.state.dropDiameter = 0;
      } else {
        this.state.dropDiameter = Math.min(6.5, Math.max(0.6, +(0.99 * Math.pow(val, 0.28)).toFixed(1)));
        this.simDia.value = this.state.dropDiameter;
        this.simDiaLabel.textContent = `${this.state.dropDiameter} mm`;
      }
      this.recalculateSensors();
      this.render();
    });

    this.simDia.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.simDiaLabel.textContent = `${val} mm`;
      this.state.dropDiameter = val;
      this.recalculateSensors();
      this.render();
    });

    this.btnClearLogs.addEventListener('click', () => {
      this.logTerminal.innerHTML = '';
      this.log('Logs cleared by user.', 'info');
    });

    // Window resize for canvases
    window.addEventListener('resize', () => {
      this.resizeCanvases();
    });
  }

  setMode(newMode) {
    this.mode = newMode;
    if (this.btnCloud) this.btnCloud.classList.toggle('active', newMode === 'cloud');
    if (this.btnLive) this.btnLive.classList.toggle('active', newMode === 'live');
    if (this.btnSim) this.btnSim.classList.toggle('active', newMode === 'sim');

    if (newMode === 'cloud') {
      this.statusText.textContent = `Connecting to Vercel Cloud...`;
      this.log(`Switched to Vercel Serverless Cloud Mode. Using API Key: ${this.apiKey ? 'configured' : 'none'}`, 'info');
      this.fetchCloudData();
    } else if (newMode === 'live') {
      this.statusText.textContent = `Polling Local ESP32 (${this.esp32Ip})`;
      this.log(`Switched to Local ESP32 Mode (${this.esp32Ip})`, 'info');
      this.fetchEsp32Data();
    } else {
      this.statusText.textContent = `Simulation Mode (Interactive)`;
      this.statusBadge.style.borderColor = 'rgba(245, 158, 11, 0.3)';
      this.statusBadge.style.color = '#fbbf24';
      this.log(`Switched to Simulation Mode. Preset test bench active.`, 'info');
    }
  }

  async fetchCloudData() {
    if (this.mode !== 'cloud') return;
    const url = this.cloudHost ? `${this.cloudHost.replace(/\/$/, '')}/api/telemetry` : '/api/telemetry';
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(url, {
        headers: {
          'x-api-key': this.apiKey,
          'bridge_key': this.apiKey
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.status === 401) {
        this.statusText.textContent = `Vercel 401 (Invalid API Key)`;
        this.statusBadge.style.borderColor = 'rgba(239, 68, 68, 0.5)';
        this.statusBadge.style.color = '#ef4444';
        this.log(`[AUTH] 401 Unauthorized: Vercel rejected API Key. Check API_KEY!`, 'danger');
        return;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      this.applyTelemetryPayload(data);
      this.statusText.textContent = `Vercel Cloud Online (Synced)`;
      this.statusBadge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
      this.statusBadge.style.color = '#34d399';
      this.render();
    } catch (err) {
      this.statusText.textContent = `Vercel Cloud (Retrying...)`;
      this.statusBadge.style.borderColor = 'rgba(245, 158, 11, 0.4)';
      this.statusBadge.style.color = '#fbbf24';
      this.render();
    }
  }

  applyTelemetryPayload(data) {
    this.state.waterPercent = data.water_pct ?? this.state.waterPercent;
    this.state.sensor1 = data.s1_adc ?? this.state.sensor1;
    this.state.sensor2 = data.s2_adc ?? this.state.sensor2;
    this.state.sensor3 = data.s3_adc ?? this.state.sensor3;
    this.state.rainRate = data.rain_rate ?? this.state.rainRate;
    this.state.dropDiameter = data.drop_diameter ?? this.state.dropDiameter;
    this.state.strikeRate = data.drops_per_min ?? this.state.strikeRate;
    this.state.ledGreen = data.led_green ?? this.state.ledGreen;
    this.state.ledYellow = data.led_yellow ?? this.state.ledYellow;
    this.state.ledRed = data.led_red ?? this.state.ledRed;
    this.state.ledBlue = data.led_blue ?? this.state.ledBlue;
    this.state.rssi = data.rssi ?? this.state.rssi;
    this.state.uptimeSeconds = data.uptime ?? this.state.uptimeSeconds;
  }

  applyPreset(preset) {
    if (this.mode !== 'sim') {
      this.setMode('sim');
    }
    switch (preset) {
      case 'clear':
        this.state.waterPercent = 18;
        this.state.rainRate = 0;
        this.state.dropDiameter = 0;
        this.state.strikeRate = 0;
        this.log('Preset: Clear Sky - Dry sensor surface.', 'info');
        break;
      case 'drizzle':
        this.state.waterPercent = 28;
        this.state.rainRate = 1.4;
        this.state.dropDiameter = 1.1;
        this.state.strikeRate = 45;
        this.log('Preset: Gentle Drizzle (0.8-1.5mm micro drops).', 'info');
        break;
      case 'moderate':
        this.state.waterPercent = 48;
        this.state.rainRate = 8.5;
        this.state.dropDiameter = 2.6;
        this.state.strikeRate = 160;
        this.log('Preset: Moderate Steady Rain (2.0-3.0mm drops).', 'info');
        break;
      case 'downpour':
        this.state.waterPercent = 76;
        this.state.rainRate = 34.0;
        this.state.dropDiameter = 4.2;
        this.state.strikeRate = 390;
        this.log('Preset: Heavy Downpour - High impact spikes detected!', 'warning');
        break;
      case 'flood':
        this.state.waterPercent = 96;
        this.state.rainRate = 62.0;
        this.state.dropDiameter = 5.6;
        this.state.strikeRate = 580;
        this.log('Preset: Torrential Cloudburst & Critical Overflow Alarm!', 'danger');
        break;
    }

    // Sync sliders
    this.simWater.value = this.state.waterPercent;
    this.simWaterLabel.textContent = `${this.state.waterPercent}%`;
    this.simRain.value = this.state.rainRate;
    this.simRainLabel.textContent = `${this.state.rainRate} mm/h`;
    this.simDia.value = this.state.dropDiameter;
    this.simDiaLabel.textContent = `${this.state.dropDiameter} mm`;

    this.recalculateSensors();
    this.render();
  }

  recalculateSensors() {
    const w = this.state.waterPercent;
    // Sensor 1 (Low): 0-33%
    this.state.sensor1 = Math.min(4095, Math.floor((w / 33) * 4095));
    // Sensor 2 (Mid): 33-66%
    this.state.sensor2 = w > 33 ? Math.min(4095, Math.floor(((w - 33) / 33) * 4095)) : 0;
    // Sensor 3 (High): 66-100%
    this.state.sensor3 = w > 66 ? Math.min(4095, Math.floor(((w - 66) / 34) * 4095)) : 0;

    // Rain drop strike rate calculation if in sim
    if (this.state.rainRate > 0) {
      this.state.strikeRate = Math.round(this.state.rainRate * 18 + (this.state.dropDiameter * 8));
      this.state.peakImpulseMv = Math.round(150 + Math.pow(this.state.dropDiameter, 2.1) * 35);
    } else {
      this.state.strikeRate = 0;
      this.state.peakImpulseMv = 0;
    }

    // Compute LED states based on hardware rule matrix:
    // Green: Safe / Low water level (< 55%) and no torrential rain
    // Yellow: Mid level (>= 33%) OR Light/Moderate rain (> 0.5 mm/h)
    // Red: Critical High level (>= 66%) OR Heavy rain (> 25 mm/h)
    // Blue: Rain active indicator (Rain rate > 0)
    const isWaterLow = w < 55;
    const isWaterMid = w >= 33 && w < 75;
    const isWaterHigh = w >= 75;
    const isRaining = this.state.rainRate > 0.4;
    const isHeavyRain = this.state.rainRate >= 25 || this.state.dropDiameter >= 3.8;

    this.state.ledGreen = isWaterLow && !isHeavyRain;
    this.state.ledYellow = isWaterMid || (isRaining && !isHeavyRain);
    this.state.ledRed = isWaterHigh || isHeavyRain;
    this.state.ledBlue = isRaining;
  }

  async fetchEsp32Data() {
    if (this.mode !== 'live') return;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`http://${this.esp32Ip}/api/telemetry`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();

      // Apply incoming telemetry
      this.state.waterPercent = data.water_pct ?? this.state.waterPercent;
      this.state.sensor1 = data.s1_adc ?? this.state.sensor1;
      this.state.sensor2 = data.s2_adc ?? this.state.sensor2;
      this.state.sensor3 = data.s3_adc ?? this.state.sensor3;
      this.state.rainRate = data.rain_rate ?? this.state.rainRate;
      this.state.dropDiameter = data.drop_diameter ?? this.state.dropDiameter;
      this.state.strikeRate = data.drops_per_min ?? this.state.strikeRate;
      this.state.ledGreen = data.led_green ?? this.state.ledGreen;
      this.state.ledYellow = data.led_yellow ?? this.state.ledYellow;
      this.state.ledRed = data.led_red ?? this.state.ledRed;
      this.state.ledBlue = data.led_blue ?? this.state.ledBlue;
      this.state.rssi = data.rssi ?? this.state.rssi;
      this.state.uptimeSeconds = data.uptime ?? this.state.uptimeSeconds;

      this.statusText.textContent = `Connected (${this.esp32Ip})`;
      this.statusBadge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
      this.statusBadge.style.color = '#34d399';
      this.render();
    } catch (err) {
      this.statusText.textContent = `Offline (Retrying ${this.esp32Ip})`;
      this.statusBadge.style.borderColor = 'rgba(239, 68, 68, 0.4)';
      this.statusBadge.style.color = '#ef4444';
      // In case hardware is not yet flashed or powered, fallback gracefully to simulation
      this.render();
    }
  }

  startLoop() {
    // 1-second main loop
    setInterval(() => {
      this.state.uptimeSeconds += 1;
      if (this.mode === 'cloud') {
        this.fetchCloudData();
      } else if (this.mode === 'live') {
        this.fetchEsp32Data();
      } else {
        // Minor dynamic jitter in simulation to feel organic
        if (this.state.rainRate > 0) {
          const jitter = (Math.random() - 0.5) * 0.4;
          this.state.rainRate = Math.max(0.1, +(this.state.rainRate + jitter).toFixed(1));
          this.recalculateSensors();
        }
        this.render();
      }
      this.pushHistory();
    }, 1000);

    this.recalculateSensors();
    this.render();
    this.pushHistory();
  }

  render() {
    this.renderWater();
    this.renderRain();
    this.renderLeds();
    this.renderAlertBanner();
    this.renderStats();
  }

  renderWater() {
    const w = this.state.waterPercent;
    this.tankLiquid.style.height = `${w}%`;
    this.totalWaterPct.textContent = Math.round(w);

    // Color gradient of liquid based on level
    if (w > 80) {
      this.tankLiquid.style.background = 'linear-gradient(180deg, #ef4444 0%, #b91c1c 40%, #7f1d1d 100%)';
      this.waterStateTag.textContent = 'CRITICAL OVERFLOW';
      this.waterStateTag.style.color = '#ef4444';
      this.waterStateTag.style.borderColor = 'rgba(239, 68, 68, 0.4)';
      this.waterStateTag.style.background = 'rgba(239, 68, 68, 0.15)';
    } else if (w > 50) {
      this.tankLiquid.style.background = 'linear-gradient(180deg, #f59e0b 0%, #d97706 40%, #92400e 100%)';
      this.waterStateTag.textContent = 'HIGH RETENTION';
      this.waterStateTag.style.color = '#fbbf24';
      this.waterStateTag.style.borderColor = 'rgba(245, 158, 11, 0.4)';
      this.waterStateTag.style.background = 'rgba(245, 158, 11, 0.15)';
    } else if (w > 20) {
      this.tankLiquid.style.background = 'linear-gradient(180deg, #38bdf8 0%, #0284c7 35%, #0369a1 100%)';
      this.waterStateTag.textContent = 'NORMAL OPERATIONAL';
      this.waterStateTag.style.color = '#38bdf8';
      this.waterStateTag.style.borderColor = 'rgba(56, 189, 248, 0.4)';
      this.waterStateTag.style.background = 'rgba(56, 189, 248, 0.15)';
    } else {
      this.tankLiquid.style.background = 'linear-gradient(180deg, #94a3b8 0%, #475569 40%, #334155 100%)';
      this.waterStateTag.textContent = 'RESERVOIR LOW / DRY';
      this.waterStateTag.style.color = '#94a3b8';
      this.waterStateTag.style.borderColor = 'rgba(148, 163, 184, 0.4)';
      this.waterStateTag.style.background = 'rgba(148, 163, 184, 0.15)';
    }

    // Markers & Tiers
    const s1Active = this.state.sensor1 > 600;
    const s2Active = this.state.sensor2 > 600;
    const s3Active = this.state.sensor3 > 600;

    this.valS1.textContent = s1Active ? 'WET' : 'DRY';
    this.valS2.textContent = s2Active ? 'WET' : 'DRY';
    this.valS3.textContent = s3Active ? 'WET' : 'DRY';

    this.markerS1.className = `sensor-marker low ${s1Active ? 'active' : ''}`;
    this.markerS2.className = `sensor-marker mid ${s2Active ? 'active' : ''}`;
    this.markerS3.className = `sensor-marker high ${s3Active ? 'active' : ''}`;

    this.tier1Bar.style.width = `${(this.state.sensor1 / 4095) * 100}%`;
    this.tier2Bar.style.width = `${(this.state.sensor2 / 4095) * 100}%`;
    this.tier3Bar.style.width = `${(this.state.sensor3 / 4095) * 100}%`;

    this.tier1Raw.textContent = `ADC: ${this.state.sensor1} / 4095`;
    this.tier2Raw.textContent = `ADC: ${this.state.sensor2} / 4095`;
    this.tier3Raw.textContent = `ADC: ${this.state.sensor3} / 4095`;
  }

  renderRain() {
    const dia = this.state.dropDiameter;
    const rate = this.state.rainRate;

    this.dropDiameterVal.textContent = dia.toFixed(1);
    this.rainRateVal.textContent = rate.toFixed(1);
    this.strikeRateVal.textContent = this.state.strikeRate;
    this.strikeRateSubtext.textContent = `Peak impulse: ${this.state.peakImpulseMv} mV (ΔG conductance)`;

    // Scale droplet visual (0.35 to 1.35 scale)
    const scale = dia > 0 ? Math.min(1.4, Math.max(0.3, dia / 3.8)) : 0.1;
    this.dropletSphere.style.transform = `scale(${scale})`;
    this.dropletSphere.style.opacity = dia > 0 ? '1' : '0.2';

    // Classification text
    if (dia === 0) {
      this.dropDiameterClass.textContent = 'No Rain / Dry Plate';
    } else if (dia < 1.4) {
      this.dropDiameterClass.textContent = 'Very Small Droplets (Mist / Fog)';
    } else if (dia < 2.2) {
      this.dropDiameterClass.textContent = 'Small Raindrop (Drizzle)';
    } else if (dia < 3.4) {
      this.dropDiameterClass.textContent = 'Standard Convective Raindrop';
    } else if (dia < 4.8) {
      this.dropDiameterClass.textContent = 'Large Droplet (Heavy Rain)';
    } else {
      this.dropDiameterClass.textContent = 'Supercell Giant Droplet (Torrential)';
    }

    if (rate === 0) {
      this.rainRateClass.textContent = 'Dry (0.0 mm/h)';
    } else if (rate < 2.5) {
      this.rainRateClass.textContent = 'Light Rain / Drizzle (< 2.5 mm/h)';
    } else if (rate < 10.0) {
      this.rainRateClass.textContent = 'Moderate Steady Rain (2.5 - 10 mm/h)';
    } else if (rate < 50.0) {
      this.rainRateClass.textContent = 'Heavy Rain (10 - 50 mm/h)';
    } else {
      this.rainRateClass.textContent = 'Violent Cloudburst (> 50 mm/h)';
    }

    // Spectrum histogram calculation based on Marshall-Palmer exponential distribution: N(D) = N0 * e^(-Lambda * D)
    this.renderSpectrum(dia, rate);
  }

  renderSpectrum(dia, rate) {
    if (rate === 0) {
      this.binMist.style.height = '0%';
      this.binDrizzle.style.height = '0%';
      this.binModerate.style.height = '0%';
      this.binHeavy.style.height = '0%';
      this.binGiant.style.height = '0%';
      this.binMistPct.textContent = '0%';
      this.binDrizzlePct.textContent = '0%';
      this.binModeratePct.textContent = '0%';
      this.binHeavyPct.textContent = '0%';
      this.binGiantPct.textContent = '0%';
      return;
    }

    // Distribute percentages centered on median diameter
    let b1 = 5, b2 = 10, b3 = 60, b4 = 20, b5 = 5;
    if (dia < 1.4) {
      b1 = 65; b2 = 28; b3 = 7; b4 = 0; b5 = 0;
    } else if (dia < 2.2) {
      b1 = 20; b2 = 55; b3 = 20; b4 = 5; b5 = 0;
    } else if (dia < 3.4) {
      b1 = 10; b2 = 25; b3 = 45; b4 = 18; b5 = 2;
    } else if (dia < 4.8) {
      b1 = 4; b2 = 12; b3 = 28; b4 = 42; b5 = 14;
    } else {
      b1 = 2; b2 = 6; b3 = 18; b4 = 36; b5 = 38;
    }

    this.binMist.style.height = `${b1}%`;
    this.binDrizzle.style.height = `${b2}%`;
    this.binModerate.style.height = `${b3}%`;
    this.binHeavy.style.height = `${b4}%`;
    this.binGiant.style.height = `${b5}%`;

    this.binMistPct.textContent = `${b1}%`;
    this.binDrizzlePct.textContent = `${b2}%`;
    this.binModeratePct.textContent = `${b3}%`;
    this.binHeavyPct.textContent = `${b4}%`;
    this.binGiantPct.textContent = `${b5}%`;
  }

  renderLeds() {
    // Green
    if (this.state.ledGreen) {
      this.ledLampGreen.className = 'physical-led green on';
      this.ledCardGreen.classList.add('active');
      this.ledStateGreen.textContent = 'ACTIVE (ON)';
    } else {
      this.ledLampGreen.className = 'physical-led green';
      this.ledCardGreen.classList.remove('active');
      this.ledStateGreen.textContent = 'OFF';
    }

    // Yellow
    if (this.state.ledYellow) {
      this.ledLampYellow.className = 'physical-led yellow on';
      this.ledCardYellow.classList.add('active');
      this.ledStateYellow.textContent = 'ACTIVE (CAUTION)';
    } else {
      this.ledLampYellow.className = 'physical-led yellow';
      this.ledCardYellow.classList.remove('active');
      this.ledStateYellow.textContent = 'OFF';
    }

    // Red
    if (this.state.ledRed) {
      this.ledLampRed.className = 'physical-led red on';
      this.ledCardRed.classList.add('active');
      this.ledStateRed.textContent = 'CRITICAL (ALERT)';
    } else {
      this.ledLampRed.className = 'physical-led red';
      this.ledCardRed.classList.remove('active');
      this.ledStateRed.textContent = 'STANDBY';
    }

    // Blue
    if (this.state.ledBlue) {
      this.ledLampBlue.className = 'physical-led blue on';
      this.ledCardBlue.classList.add('active');
      this.ledStateBlue.textContent = `PULSING (${this.state.strikeRate} dpm)`;
    } else {
      this.ledLampBlue.className = 'physical-led blue';
      this.ledCardBlue.classList.remove('active');
      this.ledStateBlue.textContent = 'IDLE (DRY)';
    }
  }

  renderAlertBanner() {
    const w = this.state.waterPercent;
    const rate = this.state.rainRate;
    const dia = this.state.dropDiameter;

    if (w >= 75 || rate >= 40) {
      this.weatherBanner.style.borderLeftColor = '#ef4444';
      this.alertTitle.textContent = 'CRITICAL HAZARD: Severe Overflow & Torrential Rainfall Alert';
      this.alertDesc.textContent = `Water reservoir level at ${Math.round(w)}% capacity with violent precipitation (${rate.toFixed(1)} mm/h, drop diameter ~${dia.toFixed(1)}mm). Emergency flood warning active.`;
      this.rainCatBadge.textContent = 'HEAVY / TORRENTIAL';
      this.rainCatBadge.style.color = '#ef4444';
      this.floodRiskBadge.textContent = 'HIGH FLOOD RISK';
      this.floodRiskBadge.style.color = '#ef4444';
    } else if (w >= 40 || rate > 2.5) {
      this.weatherBanner.style.borderLeftColor = '#f59e0b';
      this.alertTitle.textContent = 'CAUTION: Rising Water Level / Precipitation in Progress';
      this.alertDesc.textContent = `Monitoring reservoir progression (${Math.round(w)}%). Detected steady rain at ${rate.toFixed(1)} mm/h with avg drop size ${dia.toFixed(1)}mm.`;
      this.rainCatBadge.textContent = rate > 2.5 ? 'MODERATE RAIN' : 'LIGHT RAIN';
      this.rainCatBadge.style.color = '#f59e0b';
      this.floodRiskBadge.textContent = 'ELEVATED WATCH';
      this.floodRiskBadge.style.color = '#f59e0b';
    } else {
      this.weatherBanner.style.borderLeftColor = '#10b981';
      this.alertTitle.textContent = 'System Operational - Safe Hydrological State';
      this.alertDesc.textContent = 'Normal baseline water retention. Rain sensor surface dry. Monitoring transient raindrop impacts.';
      this.rainCatBadge.textContent = 'CLEAR / NO RAIN';
      this.rainCatBadge.style.color = '#10b981';
      this.floodRiskBadge.textContent = 'SAFE';
      this.floodRiskBadge.style.color = '#10b981';
    }
  }

  renderStats() {
    const hours = Math.floor(this.state.uptimeSeconds / 3600);
    const mins = Math.floor((this.state.uptimeSeconds % 3600) / 60);
    const secs = this.state.uptimeSeconds % 60;
    const pad = (n) => String(n).padStart(2, '0');
    this.statUptime.textContent = `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
    this.statRssi.textContent = `${this.state.rssi} dBm (Good)`;
  }

  log(msg, type = 'default') {
    const entry = document.createElement('div');
    const time = new Date().toLocaleTimeString();
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${time}] ${msg}`;
    this.logTerminal.appendChild(entry);
    this.logTerminal.scrollTop = this.logTerminal.scrollHeight;
  }

  // --- Rain Canvas Visual Simulation ---
  initRainCanvas() {
    this.canvas = document.getElementById('rain-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.raindrops = [];
    this.resizeCanvases();

    const renderRain = () => {
      this.updateRainPhysics();
      requestAnimationFrame(renderRain);
    };
    renderRain();
  }

  resizeCanvases() {
    if (this.canvas) {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    }
  }

  updateRainPhysics() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const rate = this.state.rainRate;
    if (rate <= 0) return;

    const dia = this.state.dropDiameter || 1.5;
    // Drop count proportional to rain rate
    const targetCount = Math.min(300, Math.floor(rate * 6 + 10));

    while (this.raindrops.length < targetCount) {
      this.raindrops.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * -this.canvas.height,
        length: Math.random() * 15 + 10 + dia * 3,
        speed: (Math.random() * 8 + 12) * (dia / 2),
        thickness: Math.max(1, dia * 0.55),
        opacity: Math.random() * 0.4 + 0.3
      });
    }

    if (this.raindrops.length > targetCount) {
      this.raindrops.splice(0, this.raindrops.length - targetCount);
    }

    ctx.strokeStyle = '#38bdf8';
    ctx.lineCap = 'round';

    for (let i = 0; i < this.raindrops.length; i++) {
      const d = this.raindrops[i];
      ctx.lineWidth = d.thickness;
      ctx.globalAlpha = d.opacity;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - 2, d.y + d.length);
      ctx.stroke();

      d.y += d.speed;
      d.x -= 1.5; // slight wind tilt

      if (d.y > this.canvas.height) {
        d.y = -20;
        d.x = Math.random() * this.canvas.width;
      }
    }
    ctx.globalAlpha = 1.0;
  }

  // --- Chart Rendering (Zero Dependencies Canvas Time-Series) ---
  initChart() {
    this.chartCanvas = document.getElementById('telemetry-chart');
    this.chartCtx = this.chartCanvas.getContext('2d');
    // Pre-populate with initial history
    for (let i = 30; i >= 0; i--) {
      this.history.labels.push(`-${i}s`);
      this.history.water.push(this.state.waterPercent);
      this.history.rain.push(this.state.rainRate);
      this.history.diameter.push(this.state.dropDiameter * 10);
    }
  }

  pushHistory() {
    this.history.labels.push(`${new Date().getSeconds()}s`);
    this.history.water.push(this.state.waterPercent);
    this.history.rain.push(this.state.rainRate);
    this.history.diameter.push(this.state.dropDiameter * 10);

    if (this.history.water.length > this.history.maxPoints) {
      this.history.labels.shift();
      this.history.water.shift();
      this.history.rain.shift();
      this.history.diameter.shift();
    }

    this.drawChart();
  }

  drawChart() {
    const canvas = this.chartCanvas;
    const ctx = this.chartCtx;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Draw grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    for (let y = 30; y < h - 20; y += 40) {
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(w - 20, y);
      ctx.stroke();
    }

    const n = this.history.water.length;
    if (n < 2) return;

    const xStep = (w - 60) / (n - 1);
    const maxY = 100; // 0 to 100%

    const getX = (i) => 45 + i * xStep;
    const getY = (val) => (h - 30) - (Math.min(100, Math.max(0, val)) / maxY) * (h - 60);

    // 1. Water Level Series (Cyan)
    ctx.strokeStyle = '#00d2ff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = getX(i);
      const y = getY(this.history.water[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 2. Rain Intensity Series (Purple)
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = getX(i);
      const y = getY(this.history.rain[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 3. Droplet Diameter Series (Blue)
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = getX(i);
      const y = getY(this.history.diameter[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]); // Reset dash
  }
}

// Instantiate on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new HydroSenseDashboard();
});
