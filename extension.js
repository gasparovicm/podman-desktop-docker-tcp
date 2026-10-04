// Podman Desktop extension: Docker over TCP
//
// Podman Desktop's core can only talk to engines through a local socket / named pipe.
// For every configured tcp:// engine this extension opens a private local pipe,
// relays it to the TCP address, and registers it as a Docker container connection.

const extensionApi = require('@podman-desktop/api');
const net = require('node:net');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const CONFIG_SECTION = 'dockerTcp';
const PING_INTERVAL_MS = 5000;

let provider;
let active = []; // { name, server, disposable, timer }
const statuses = new Map();

function parseEndpoints(raw) {
  return String(raw || '')
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .map(entry => {
      const eq = entry.indexOf('=');
      const name = (eq > 0 ? entry.slice(0, eq) : entry).trim();
      const url = new URL((eq > 0 ? entry.slice(eq + 1) : entry).trim());
      if (url.protocol !== 'tcp:') throw new Error(`Only tcp:// is supported: ${entry}`);
      return { name, host: url.hostname.replace(/^\[|\]$/g, ''), port: Number(url.port || 2375) };
    });
}

function localPaths(name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'engine';
  if (process.platform === 'win32') {
    return { listen: `\\\\.\\pipe\\pd-docker-tcp-${slug}`, socketPath: `//./pipe/pd-docker-tcp-${slug}` };
  }
  const p = path.join(os.tmpdir(), `pd-docker-tcp-${slug}.sock`);
  return { listen: p, socketPath: p };
}

function startRelay(ep, listenPath) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32' && fs.existsSync(listenPath)) fs.unlinkSync(listenPath);
    const server = net.createServer({ allowHalfOpen: true }, client => {
      const upstream = net.connect({ host: ep.host, port: ep.port, allowHalfOpen: true });
      upstream.setNoDelay(true);
      client.pipe(upstream);
      upstream.pipe(client);
      const kill = () => { client.destroy(); upstream.destroy(); };
      client.on('error', kill);
      upstream.on('error', kill);
      client.on('close', () => upstream.end());
      upstream.on('close', () => client.end());
    });
    server.once('error', reject);
    server.listen(listenPath, () => resolve(server));
  });
}

function ping(ep) {
  return new Promise(resolve => {
    const req = http.get({ host: ep.host, port: ep.port, path: '/_ping', timeout: 2000 }, res => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
  });
}

function refreshProviderStatus() {
  if (!provider) return;
  const anyUp = [...statuses.values()].some(s => s === 'started');
  provider.updateStatus(anyUp ? 'started' : 'stopped');
}

async function setup() {
  teardown();
  let endpoints;
  try {
    endpoints = parseEndpoints(extensionApi.configuration.getConfiguration(CONFIG_SECTION).get('endpoints'));
  } catch (err) {
    extensionApi.window.showErrorMessage(`Docker over TCP: ${err.message}`);
    return;
  }

  for (const ep of endpoints) {
    const { listen, socketPath } = localPaths(ep.name);
    let server;
    try {
      server = await startRelay(ep, listen);
    } catch (err) {
      console.error(`[docker-tcp] cannot open ${listen}:`, err);
      continue;
    }

    statuses.set(ep.name, (await ping(ep)) ? 'started' : 'stopped');

    const disposable = provider.registerContainerProviderConnection({
      name: ep.name,
      displayName: ep.name,
      type: 'docker',
      status: () => statuses.get(ep.name) ?? 'unknown',
      endpoint: { socketPath },
    });

    const timer = setInterval(async () => {
      const next = (await ping(ep)) ? 'started' : 'stopped';
      if (next !== statuses.get(ep.name)) {
        statuses.set(ep.name, next);
        refreshProviderStatus();
      }
    }, PING_INTERVAL_MS);

    active.push({ name: ep.name, server, disposable, timer });
    console.log(`[docker-tcp] ${ep.name}: ${listen} -> ${ep.host}:${ep.port}`);
  }
  refreshProviderStatus();
}

function teardown() {
  for (const a of active) {
    clearInterval(a.timer);
    try { a.disposable.dispose(); } catch { /* ignore */ }
    try { a.server.close(); } catch { /* ignore */ }
  }
  active = [];
  statuses.clear();
}

async function activate(extensionContext) {
  provider = extensionApi.provider.createProvider({
    name: 'Docker over TCP',
    id: 'docker-tcp',
    status: 'unknown',
  });
  extensionContext.subscriptions.push(provider);

  extensionContext.subscriptions.push(
    extensionApi.configuration.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration(CONFIG_SECTION)) {
        setup().catch(err => console.error('[docker-tcp] setup failed', err));
      }
    }),
  );

  await setup();
}

function deactivate() {
  teardown();
}

module.exports = { activate, deactivate };
