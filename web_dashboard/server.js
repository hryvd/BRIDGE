/**
 * HydroSense & PluvioScan Node.js Telemetry Server
 * Built with native Node.js modules - NO npm install required!
 * 
 * Features:
 *  - Serves web_dashboard static files (HTML, CSS, JS) on http://localhost:3000
 *  - REST API endpoint: POST /api/telemetry (for ESP32 to push sensor data directly)
 *  - REST API endpoint: GET /api/telemetry (for Web Dashboard to retrieve latest live reading)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const PUBLIC_DIR = __dirname;

// In-memory latest telemetry storage
let latestTelemetry = {
  water_pct: 42.0,
  s1_adc: 3820,
  s2_adc: 2450,
  s3_adc: 120,
  rain_rate: 8.4,
  drop_diameter: 2.8,
  avg_diameter: 2.6,
  drops_per_min: 142,
  rain_class: "Moderate Rain",
  peak_impulse_mv: 620.0,
  led_green: true,
  led_yellow: true,
  led_red: false,
  led_blue: true,
  rssi: -58,
  uptime: 120,
  timestamp: Date.now()
};

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // API Endpoints
  if (url.pathname === '/api/telemetry') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(latestTelemetry));
      return;
    } else if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          latestTelemetry = { ...latestTelemetry, ...parsed, timestamp: Date.now() };
          console.log(`[INGEST] Telemetry received from IoT device: Water=${latestTelemetry.water_pct}%, Rain=${latestTelemetry.rain_rate} mm/h`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', received: true }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
        }
      });
      return;
    }
  }

  // Static File Serving
  let filePath = path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Server Error');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` HydroSense & PluvioScan Telemetry Server Running!     `);
  console.log(` Web Dashboard: http://localhost:${PORT}                 `);
  console.log(` Ingest Endpoint: http://localhost:${PORT}/api/telemetry`);
  console.log(`=======================================================`);
});
