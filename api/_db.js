/**
 * Database & Authentication Helper for Vercel Serverless Functions
 * Supports Upstash Redis with graceful in-memory fallback
 */
const { Redis } = require('@upstash/redis');

let redis = null;
const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

if (redisUrl && redisToken) {
  try {
    redis = new Redis({
      url: redisUrl,
      token: redisToken,
    });
  } catch (err) {
    console.warn('[DB] Upstash Redis initialization error:', err.message);
  }
}

// In-memory fallback telemetry
let memoryTelemetry = {
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

let memoryHistory = [];

/**
 * Validates request authorization using API Key
 * Checks header 'x-api-key' or query parameter '?key=...'
 */
function isAuthorized(req) {
  const configuredKey = process.env.API_KEY || 'bridge_secret_key';
  
  // Extract key from header or query string
  const headerKey = req.headers['x-api-key'];
  let queryKey = req.query && req.query.key;
  if (!queryKey && req.url) {
    try {
      queryKey = new URL(req.url, 'http://localhost').searchParams.get('key');
    } catch (e) {}
  }

  const providedKey = headerKey || queryKey;
  
  // If API_KEY environment variable is set on Vercel, must match exact key
  if (process.env.API_KEY) {
    return providedKey === process.env.API_KEY;
  }
  
  // Default prototype key fallback
  return !providedKey || providedKey === 'bridge_secret_key';
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'x-api-key, Content-Type');
}

module.exports = {
  redis,
  memoryTelemetry,
  memoryHistory,
  isAuthorized,
  setCorsHeaders
};
