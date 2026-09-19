import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { createResearcher, ResearchError } from './pipeline.js';
import { liveProvider, mockProvider } from './providers.js';

export function createServer(research) {
  return http.createServer(async (req, res) => {
    const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(data)); };
    // Local development endpoint; browser clients should use a same-origin backend proxy.
    const port = req.socket.localPort;
    if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(req.headers.host)) return send(403, { error: 'Local access only.' });
    if (req.headers.origin && ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(req.headers.origin)) return send(403, { error: 'Use a same-origin backend proxy.' });
    if (req.method === 'GET' && req.url === '/health') return send(200, { ok: true });
    if (req.method !== 'POST' || req.url !== '/api/research') return send(404, { error: 'Use POST /api/research.' });
    try {
      if (!req.headers['content-type']?.startsWith('application/json')) throw new ResearchError('Content-Type must be application/json.', 415);
      let data = '';
      for await (const chunk of req) {
        data += chunk;
        if (Buffer.byteLength(data) > 8192) throw new ResearchError('Request too large.', 413);
      }
      let input;
      try { input = JSON.parse(data); } catch { throw new ResearchError('Invalid JSON.'); }
      send(200, await research(input));
    } catch (error) {
      send(error instanceof ResearchError ? error.status : 500,
        { error: error instanceof ResearchError ? error.message : 'Research failed. Try again.' });
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.env.RESEARCH_MODE ?? 'mock';
  if (!['live', 'mock'].includes(mode)) throw new Error('RESEARCH_MODE must be live or mock.');
  const provider = mode === 'live' ? liveProvider() : mockProvider();
  createServer(createResearcher(provider)).listen(Number(process.env.PORT ?? 8787), '127.0.0.1', () => {
    console.log(`Rally research API: http://127.0.0.1:${process.env.PORT ?? 8787} (${provider.mode})`);
  });
}
