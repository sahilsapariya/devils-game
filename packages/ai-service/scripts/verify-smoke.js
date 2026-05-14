#!/usr/bin/env node
/* eslint-disable */
// Standalone smoke verification used by the AI-OPENAI refactor task.
// Hits /health, /internal/generate-announcement, /internal/cache/stats.
const http = require('http');

const BASE = 'http://localhost:4001';
const TOKEN = process.env.INTERNAL_API_TOKEN || 'dev-internal-token';

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      method,
      hostname: 'localhost',
      port: 4001,
      path,
      headers: { 'X-Internal-Token': TOKEN, 'Content-Type': 'application/json' },
    };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    const r = http.request(opts, (res) => {
      let chunks = '';
      res.on('data', (c) => (chunks += c));
      res.on('end', () => resolve({ status: res.statusCode, body: chunks }));
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  const h = await req('GET', '/health');
  console.log(`HEALTH ${h.status}: ${h.body}`);

  const a = await req('POST', '/internal/generate-announcement', {
    type: 'status_report',
    context: {
      roundId: 'r1',
      userId: 'u1',
      state: 'OPERATIONAL',
      timeRemainingSec: 1200,
      violations: 2,
      streak: 3,
      reputation: 450,
      recentPattern: {},
    },
    skipVoice: true,
  });
  console.log(`ANNOUNCE ${a.status}: ${a.body}`);

  const s = await req('GET', '/internal/cache/stats');
  console.log(`CACHE-STATS ${s.status}: ${s.body}`);
})();
