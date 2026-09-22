import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const port = Number(process.env.PORT || 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET is required');
const dataDir = '/data';
mkdirSync(`${dataDir}/backend`, { recursive: true });
mkdirSync(`${dataDir}/profile-cache`, { recursive: true });
const keyPath = `${dataDir}/internal-key`;
let internalKey;
try { internalKey = readFileSync(keyPath, 'utf8').trim(); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  internalKey = randomBytes(32).toString('hex');
  writeFileSync(keyPath, internalKey, { flag: 'wx', mode: 0o600 });
}
if (internalKey.length < 32) throw new Error('Invalid stored internal key');
const publicHost = process.env.RAILWAY_PUBLIC_DOMAIN;
const env = {
  ...process.env,
  DATABASE_URL: 'file:/data/arachne.db',
  UPLOAD_DIR: '/data/uploads',
  BACKEND_DATA_DIR: '/data/backend',
  PROFILE_CACHE_DIR: '/data/profile-cache',
  INTERNAL_API_KEY: internalKey,
  TEAM_API_URL: 'http://127.0.0.1:8000',
  RESEARCH_SERVICE_URL: 'http://127.0.0.1:8791',
  VOICE_API_URL: process.env.VOICE_API_URL || (publicHost ? `https://${publicHost}` : ''),
  FRONTEND_ORIGINS: publicHost ? `https://${publicHost}` : '',
};
const schema = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate'], { env, stdio: 'inherit' });
if (schema.status !== 0) process.exit(schema.status || 1);

const children = [];
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => { for (const child of children) child.kill('SIGKILL'); process.exit(code); }, 5000);
}
function start(name, command, args, extra = {}, cwd = '/app') {
  const child = spawn(command, args, { cwd, env: { ...env, ...extra }, stdio: 'inherit' });
  children.push(child);
  child.on('error', error => { console.error(`${name} failed: ${error.message}`); stop(1); });
  child.on('exit', code => { if (!stopping) { console.error(`${name} stopped (${code})`); stop(1); } });
}
process.on('SIGTERM', () => stop(0));
process.on('SIGINT', () => stop(0));
start('backend', '/opt/venv/bin/python', ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000'], {}, '/app/backend');
start('research', process.execPath, ['research-app.mjs'], { PORT: '8791', HOST: '127.0.0.1', PUBLIC_ORIGIN: 'http://127.0.0.1:8791' }, '/app/research-service');
start('frontend', process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3000']);
async function ready(url) {
  for (let i = 0; i < 90 && !stopping; i++) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`Service readiness failed: ${url}`);
}
try {
  await Promise.all(['http://127.0.0.1:8000/health', 'http://127.0.0.1:8791/health', 'http://127.0.0.1:3000/login'].map(ready));
  writeFileSync('/tmp/Caddyfile', `{
  auto_https off
  admin off
}
:${port} {
  handle /voice/session {
    reverse_proxy 127.0.0.1:8000
  }
  handle {
    reverse_proxy 127.0.0.1:3000
  }
}
`);
  start('gateway', '/usr/local/bin/caddy', ['run', '--config', '/tmp/Caddyfile', '--adapter', 'caddyfile']);
} catch (error) { console.error(error.message); stop(1); }
