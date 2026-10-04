// Client OCI minimal cu semnare de requesturi (http-signatures-draft, ca în SDK-ul oficial).
// Fără dependențe externe — doar `node:https`, `node:crypto`, `node:fs`.
// Folosit ca să nu depindem de interfața web OCI (fragilă) pentru crearea serverului.
//
// Format de semnare (vezi oci-go-sdk/common/http_signer.go):
//   signingString = "date: <date>\n(request-target): <metoda_mica> <cale+query>\nhost: <host>\n[content-length...\ncontent-type...\nx-content-sha256...]"
//   Semnezi doar generic headers (date, (request-target), host) + body headers
//   (content-length, content-type, x-content-sha256) DOAR pentru POST/PUT/PATCH.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');

const OCI_DIR = path.join(os.homedir(), '.oci');
const CFG_PATH = path.join(OCI_DIR, 'config');

function parseConfig() {
  const raw = fs.readFileSync(CFG_PATH, 'utf8');
  const out = { profiles: {} };
  let cur = null;
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    if (t.startsWith('[') && t.endsWith(']')) {
      cur = t.slice(1, -1);
      out.profiles[cur] = {};
      continue;
    }
    const i = t.indexOf('=');
    if (i < 0 || !cur) continue;
    out.profiles[cur][t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

function config() {
  const p = parseConfig().profiles.DEFAULT;
  if (!p) throw new Error('Nu am gasit profilul DEFAULT in ' + CFG_PATH);
  if (!p.fingerprint || !p.tenancy || !p.user) {
    throw new Error(
      'Configurare incompleta: lipseste una din fingerprint / tenancy / user. ' +
        'Chei gasite: ' + Object.keys(p).join(', '),
    );
  }
  return {
    tenancy: p.tenancy,
    user: p.user,
    fingerprint: p.fingerprint.toLowerCase(),
    region: p.region || 'eu-stockholm-1',
    keyFile: p.key_file || path.join(OCI_DIR, 'oci_api_key.pem'),
  };
}

const HAS_BODY = new Set(['POST', 'PUT', 'PATCH']);

function request(method, pathAndQuery, opts = {}) {
  const cfg = opts.config || config();
  const service = opts.service || 'iaas';
  const host = `${service}.${cfg.region}.oraclecloud.com`;
  const m = method.toUpperCase();
  const bodyBuf = opts.body ? Buffer.from(opts.body) : null;

  const date = new Date().toUTCString();
  const requestTarget = `${m.toLowerCase()} ${pathAndQuery}`;

  // Ordinea semnăturii contează: generic headers, apoi body headers (doar dacă există body).
  const signingParts = [`date: ${date}`, `(request-target): ${requestTarget}`, `host: ${host}`];
  if (HAS_BODY.has(m)) {
    const contentType = opts.contentType || 'application/json';
    const hash = crypto.createHash('sha256').update(bodyBuf || Buffer.alloc(0)).digest('base64');
    signingParts.push(`content-length: ${(bodyBuf || Buffer.alloc(0)).length}`);
    signingParts.push(`content-type: ${contentType}`);
    signingParts.push(`x-content-sha256: ${hash}`);
  }
  const signingString = signingParts.join('\n');

  const key = crypto.createPrivateKey(fs.readFileSync(cfg.keyFile));
  const signature = crypto
    .sign('RSA-SHA256', Buffer.from(signingString), key)
    .toString('base64');

  const headersToSign = HAS_BODY.has(m)
    ? 'date (request-target) host content-length content-type x-content-sha256'
    : 'date (request-target) host';

  const authorization =
    `Signature version="1",headers="${headersToSign}",` +
    `keyId="${cfg.tenancy}/${cfg.user}/${cfg.fingerprint}",` +
    `algorithm="rsa-sha256",signature="${signature}"`;

  const reqHeaders = { host, date, authorization };
  if (bodyBuf) {
    reqHeaders['content-type'] = opts.contentType || 'application/json';
    reqHeaders['content-length'] = bodyBuf.length;
    reqHeaders['x-content-sha256'] = crypto
      .createHash('sha256')
      .update(bodyBuf)
      .digest('base64');
  }

  return new Promise((resolve, reject) => {
    const req = https.request({ host, method: m, path: pathAndQuery, headers: reqHeaders }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {
          /* răspuns non-JSON */
        }
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(json || {});
        else {
          const err = new Error(`HTTP ${res.statusCode}: ${data.slice(0, 800)}`);
          err.status = res.statusCode;
          err.body = json;
          reject(err);
        }
      });
    });
    req.on('error', reject);
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

module.exports = { request, get: (p, o) => request('GET', p, o), post: (p, b, o) => request('POST', p, { ...o, body: b }), config, parseConfig, CFG_PATH };
