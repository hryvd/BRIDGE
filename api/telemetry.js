/**
 * Vercel Serverless Function: /api/telemetry
 * Handles:
 *  - POST: Ingests sensor telemetry from ESP32 with x-api-key authentication
 *  - GET: Serves the latest telemetry to the web dashboard
 */
const { redis, memoryTelemetry, memoryHistory, isAuthorized, setCorsHeaders } = require('./_db');

module.exports = async (req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // 1. GET Request: Dashboard fetching latest telemetry
  if (req.method === 'GET') {
    try {
      if (redis) {
        const stored = await redis.get('bridge:telemetry');
        if (stored) {
          const data = typeof stored === 'string' ? JSON.parse(stored) : stored;
          return res.status(200).json(data);
        }
      }
      // Return memory fallback if Redis empty or not yet configured
      return res.status(200).json(memoryTelemetry);
    } catch (err) {
      console.error('[API] Error retrieving telemetry:', err);
      return res.status(200).json(memoryTelemetry);
    }
  }

  // 2. POST Request: IoT device pushing telemetry
  if (req.method === 'POST') {
    // Authenticate API Key
    if (!isAuthorized(req)) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or missing API Key' });
    }

    try {
      let payload = req.body;
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch (e) {
          return res.status(400).json({ error: 'Invalid JSON payload' });
        }
      }

      if (!payload || typeof payload !== 'object') {
        return res.status(400).json({ error: 'Payload must be a JSON object' });
      }

      // Format clean record
      const telemetryRecord = {
        water_pct: parseFloat(payload.water_pct ?? 0),
        s1_adc: parseInt(payload.s1_adc ?? 0),
        s2_adc: parseInt(payload.s2_adc ?? 0),
        s3_adc: parseInt(payload.s3_adc ?? 0),
        rain_rate: parseFloat(payload.rain_rate ?? 0),
        drop_diameter: parseFloat(payload.drop_diameter ?? 0),
        avg_diameter: parseFloat(payload.avg_diameter ?? 0),
        drops_per_min: parseInt(payload.drops_per_min ?? 0),
        rain_class: String(payload.rain_class ?? 'Unknown'),
        peak_impulse_mv: parseFloat(payload.peak_impulse_mv ?? 0),
        led_green: Boolean(payload.led_green),
        led_yellow: Boolean(payload.led_yellow),
        led_red: Boolean(payload.led_red),
        led_blue: Boolean(payload.led_blue),
        rssi: parseInt(payload.rssi ?? -60),
        uptime: parseInt(payload.uptime ?? 0),
        timestamp: Date.now()
      };

      // Update in-memory cache
      Object.assign(memoryTelemetry, telemetryRecord);

      // If Upstash Redis is connected, persist record and append to history log
      if (redis) {
        await redis.set('bridge:telemetry', JSON.stringify(telemetryRecord));
        
        const historyPoint = {
          t: telemetryRecord.timestamp,
          w: telemetryRecord.water_pct,
          r: telemetryRecord.rain_rate,
          d: telemetryRecord.drop_diameter
        };
        await redis.lpush('bridge:history', JSON.stringify(historyPoint));
        await redis.ltrim('bridge:history', 0, 59); // Keep latest 60 data points (e.g. 5 mins)
      }

      return res.status(200).json({
        status: 'ok',
        received: true,
        timestamp: telemetryRecord.timestamp
      });
    } catch (err) {
      console.error('[API] Error handling telemetry POST:', err);
      return res.status(500).json({ error: 'Internal server error processing telemetry' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
