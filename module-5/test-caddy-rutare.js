/* ============================================================
 * AutoAct | module-5/test-caddy-rutare.js
 * TEST DE RUTARE REALĂ — Caddy cu fișierul real și site-ul real.
 * ============================================================
 * `caddy validate` dovedește doar că nu e eroare de sintaxă. Nu
 * dovedește că /contact întoarce pagina de contact și nu interfața
 * n8n — și exact acolo se ascundeau greșelile: un proxy inversat
 * pentru tot domeniul ar trimite orice pagină în n8n, iar UI-ul de
 * administrare la rădăcină ar înlocui site-ul public.
 *
 * METODA: rețea Docker temporară + Caddy real + client curl într-un
 * al doilea container. Clientul rulează în aceeași rețea ca serverul,
 * așa că DNS-ul Docker rezolvă domeniul prin alias — de aceea testul nu
 * depinde de DNS public, de Let's Encrypt, nici de existența domeniului.
 * Folosim CA-ul intern al lui Caddy (`USE_LOCAL_CERTS=true`); în
 * producție varianta e `false` și certificatul vine de la Let's Encrypt.
 *
 * Rulează:  node module-5/test-caddy-rutare.js
 * Ieșire:   0 = rutarea e corectă, 1 = o cale merge greșit
 * ============================================================ */
'use strict';

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RADACINA = path.join(__dirname, '..');
const MODULE_3 = path.join(RADACINA, 'module-3');
const SITE = path.join(RADACINA, 'site');
const CADDYFILE = path.join(MODULE_3, 'caddy', 'Caddyfile');

const NET = 'autoact-test-net';
const CADDY = 'autoact-test-caddy';
const DOMAIN_TEST = 'autoact.test';
const MARCAJ_N8N = 'N8N-BACKEND';

let total = 0, esecuri = 0;
const check = (cond, mesaj, detaliu) => {
  total++;
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + mesaj + (!cond && detaliu ? '  → ' + detaliu : ''));
  if (!cond) esecuri++;
};

/* ---------- 0. Docker ---------- */
if (spawnSync('docker', ['info'], { encoding: 'utf8' }).status !== 0) {
  console.log('SKIP  Docker daemon indisponibil — rutarea Caddy nu poate fi testată.');
  console.log('      (În CI Docker e preinstalat; local, pornește Docker Desktop.)');
  process.exit(0);
}

/* ---------- 1. Artefactele site-ului trebuie să existe ---------- */
for (const f of ['index.html', 'contact.html', 'styles.css', 'app.js', 'config.js']) {
  check(fs.existsSync(path.join(SITE, f)),
    'site/' + f + ' există (artefact generat)',
    'rulează node site/construieste-inline.js');
}
if (!fs.existsSync(CADDYFILE)) {
  console.error('Lipsește ' + CADDYFILE);
  process.exit(1);
}

/* ---------- 2. Backend fals, în rolul lui n8n ---------- */
/* Marcajul „N8N-BACKEND" face imposibil de încurcat o pagină statică
 * cu răspunsul backend-ului — o aserție pe cod HTTP n-ar prinde cazul
 * în care interfața n8n ar fi servită la rădăcină.
 *
 * Scriptul e transmis ca argument `node -e`, dar CRIPTAT în base64.
 * Două motive, ambele întâlnite efectiv aici:
 *   · fișier montat — Docker Desktop creează un director cu numele
 *     sursei dacă fișierul lipsește, iar un reziduu strică rularea următoare;
 *   · script în clar — pe Windows, argumentele cu ghilimele duble sunt
 *     transmise greșit de `spawn`, iar containerul moare cu sintaxă
 *     invalidă și log gol. Base64 nu conține ghilimele deloc. */
const SCRIPT_BACKEND = [
  "const http = require('http');",
  "http.createServer(function (req, res) {",
  "  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });",
  "  res.end('<html><body>" + MARCAJ_N8N + " ' + req.url + '</body></html>');",
  "}).listen(5678, '0.0.0.0');"
].join('\n');

const ARG_BACKEND = 'eval(Buffer.from(\'' +
  Buffer.from(SCRIPT_BACKEND, 'utf8').toString('base64') + '\',\'base64\').toString())';

const curataza = () => {
  spawnSync('docker', ['rm', '-f', CADDY], { encoding: 'utf8' });
  spawnSync('docker', ['rm', '-f', 'autoact-test-n8n'], { encoding: 'utf8' });
  spawnSync('docker', ['network', 'rm', NET], { encoding: 'utf8' });
};

curataza();
spawnSync('docker', ['network', 'create', NET], { encoding: 'utf8' });

/* ---------- 3. Backend fals + Caddy, în două containere ----------
 * Ca în producție: backend-ul e un container separat, la care Caddy
 * ajunge după numele `n8n` de pe rețea. */
const pornitBackend = spawnSync('docker', [
  'run', '-d', '--name', 'autoact-test-n8n', '--network', NET, '--network-alias', 'n8n',
  'node:20-alpine', 'node', '-e', ARG_BACKEND
], { encoding: 'utf8' });

const pornitCaddy = spawnSync('docker', [
  'run', '-d', '--name', CADDY, '--network', NET, '--network-alias', DOMAIN_TEST,
  '-e', 'DOMAIN=' + DOMAIN_TEST, '-e', 'SITE_ROOT=/srv', '-e', 'USE_LOCAL_CERTS=true',
  '--mount', 'type=bind,src=' + CADDYFILE + ',dst=/etc/caddy/Caddyfile,readonly',
  '--mount', 'type=bind,src=' + SITE + ',dst=/srv,readonly',
  'caddy:2-alpine',
  'caddy', 'run', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'
], { encoding: 'utf8' });

if (pornitCaddy.status !== 0 || pornitBackend.status !== 0) {
  console.error('Containerele de test nu au pornit:\n' + (pornitCaddy.stderr || '') + (pornitBackend.stderr || ''));
  curataza();
  process.exit(1);
}

const asteapta = (ms) => spawnSync('node', ['-e', 'setTimeout(()=>{},' + ms + ')']);

/* Așteptăm ambele containere. Verificarea se face pe comportament, nu
 * pe „containerul există": un backend care a pornit dar nu ascultă încă
 * ar da 502 la proxy, iar un Caddy care nu a încărcat configurația ar
 * da răspuns gol. */
function backendRaspunde() {
  const r = spawnSync('docker', [
    'run', '--rm', '--network', NET, 'curlimages/curl:latest',
    '-s', '-o', '/dev/null', '-w', '%{http_code}', 'http://n8n:5678/ping'
  ], { encoding: 'utf8' });
  return Number((r.stdout || '0').trim()) !== 0;
}

let gata = false;
for (let i = 0; i < 20; i++) {
  asteapta(1000);
  if (verifica('/').code !== 0 && backendRaspunde()) { gata = true; break; }
}
if (!gata) {
  const stareBackend = spawnSync('docker', ['inspect', '-f', '{{.State.Status}}', 'autoact-test-n8n'], { encoding: 'utf8' }).stdout.trim();
  console.error('Stack-ul de test nu s-a ridicat.');
  console.error('backend: ' + (stareBackend || 'container inexistent'));
  console.error('log backend:\n' + (spawnSync('docker', ['logs', '--tail', '15', 'autoact-test-n8n'], { encoding: 'utf8' }).stdout || '(gol)'));
  console.error('log caddy:\n' + (spawnSync('docker', ['logs', '--tail', '15', CADDY], { encoding: 'utf8' }).stdout || '(gol)'));
  curataza();
  process.exit(1);
}

/* ---------- 4. Clientul de cereri ---------- */
/* Rulează într-un container separat, în aceeași rețea. Formatul de
 * ieșire e un rând per cale, ușor de parsat, cu tot ce ne trebuie. */
function verifica(cale, extraHeaders) {
  const format = '%{http_code}|%{content_type}|%{size_download}';
  const args = [
    'run', '--rm', '--network', NET, 'curlimages/curl:latest',
    '-sk', '-o', '/dev/null', '-w', format
  ];
  if (extraHeaders) for (const h of extraHeaders) args.push('-H', h);
  args.push('https://' + DOMAIN_TEST + cale);

  const r = spawnSync('docker', args, { encoding: 'utf8' });
  const linie = (r.stdout || '').trim();
  const [code, tip, marime] = linie.split('|');
  return { code: Number(code) || 0, tip: tip || '', marime: Number(marime) || 0 };
}

function corp(cale) {
  const r = spawnSync('docker', [
    'run', '--rm', '--network', NET, 'curlimages/curl:latest', '-sk',
    'https://' + DOMAIN_TEST + cale
  ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  return r.stdout || '';
}

function antet(cale, nume) {
  const r = spawnSync('docker', [
    'run', '--rm', '--network', NET, 'curlimages/curl:latest', '-skI',
    'https://' + DOMAIN_TEST + cale
  ], { encoding: 'utf8' });
  const m = (r.stdout || '').toLowerCase().match(new RegExp('^' + nume + ':\\s*(.+)$', 'm'));
  return m ? m[1].trim() : '';
}

/* ---------- 5. Rutarea ---------- */
console.log('');

const home = verifica('/');
check(home.code === 200, '/  → 200', 'status ' + home.code);
check(home.tip.includes('text/html'), '/  → tip MIME text/html', 'primit: ' + home.tip);
const corpHome = corp('/');
check(corpHome.includes('app.js') && corpHome.includes('<title>'),
  '/  → conține aplicația site-ului');
check(!corpHome.includes(MARCAJ_N8N),
  '/  → pagina publică, NU interfața n8n',
  'rădăcina a fost servită de backend');

const contact = verifica('/contact');
check(contact.code === 200, '/contact → 200', 'status ' + contact.code);
check(!corp('/contact').includes(MARCAJ_N8N),
  '/contact → pagina de contact, NU backend-ul',
  'calea curată nu ajunge la contact.html');
check(/CIF|Reg\. Com|tel:|mailto:/i.test(corp('/contact')),
  '/contact → conține NAP-ul (CIF, telefon, e-mail)');

const css = verifica('/styles.css');
check(css.code === 200 && css.tip.includes('text/css'),
  '/styles.css → 200 text/css', 'status ' + css.code + ' tip ' + css.tip);

const js = verifica('/app.js');
check(js.code === 200 && js.tip.includes('javascript'),
  '/app.js → 200 javascript', 'status ' + js.code + ' tip ' + js.tip);

const cfg = verifica('/config.js');
check(cfg.code === 200, '/config.js → 200', 'status ' + cfg.code);

/* --- Proxy spre n8n --- */
for (const cale of ['/webhook/test-ui', '/webhook/plata']) {
  const r = verifica(cale);
  const c = corp(cale);
  check(r.code === 200 && c.includes(MARCAJ_N8N),
    cale + ' → ajunge la backend-ul n8n',
    'status ' + r.code + ' | marcaj prezent: ' + c.includes(MARCAJ_N8N));
}

/* --- Cărute inexistente: 404 real, NU interfața n8n --- */
const inexistent = verifica('/nu-exista-deloc');
check(inexistent.code === 404,
  '/nu-exista-deloc → 404 real',
  'status ' + inexistent.code + ' (n-ar trebui să fie 200 din n8n)');
check(!corp('/nu-exista-deloc').includes(MARCAJ_N8N),
  '404-ul nu e înlocuit de interfața n8n');

/* --- UI de administrare, la cale explicită --- */
const n8nUi = verifica('/n8n/');
check(n8nUi.code === 200 && corp('/n8n/').includes(MARCAJ_N8N),
  '/n8n/ → ajunge la interfața n8n',
  'status ' + n8nUi.code);
const radacina = verifica('/n8n');
check(radacina.code === 308,
  '/n8n → redirect permanent spre /n8n/',
  'status ' + radacina.code + ' (așteptam 308)');

/* --- Anteturi de securitate și cache --- */
const hsts = antet('/', 'strict-transport-security');
check(hsts.includes('max-age'), 'răspunsul static are HSTS', 'lipsște: „' + hsts + '”');

const ccHtml = antet('/', 'cache-control');
check(/max-age=\d+/.test(ccHtml), 'HTML are Cache-Control', 'lipsă: „' + ccHtml + '”');

const ccAsset = antet('/styles.css', 'cache-control');
const zHtml = Number((ccHtml.match(/max-age=(\d+)/) || [])[1] || 0);
const zAsset = Number((ccAsset.match(/max-age=(\d+)/) || [])[1] || 0);
check(zAsset >= zHtml && zAsset > 0,
  'fișierele de cod au cache cel puțin egal cu HTML-ul',
  'asset=' + ccAsset + ' | html=' + ccHtml);

check(!/Caddy/i.test(antet('/', 'server')),
  'antetul Server nu dezvăluie tehnologia',
  'primit: ' + antet('/', 'server'));

/* --- Compresie --- */
const comprimat = spawnSync('docker', [
  'run', '--rm', '--network', NET, 'curlimages/curl:latest', '-sk',
  '-H', 'Accept-Encoding: gzip', '-o', '/dev/null', '-w', '%{size_download}',
  'https://' + DOMAIN_TEST + '/'
], { encoding: 'utf8' });
const zGzip = Number((comprimat.stdout || '0').trim());
check(zGzip > 0 && zGzip < home.marime,
  'răspunsul HTML e comprimat',
  'gzip=' + zGzip + ' bytes vs necomprimat=' + home.marime + ' (0 = conexiune eșuată)');

/* ---------- 6. Deploy-ul trebuie să trimită site-ul pe server ---------- */
/* Fără sincronizare, Docker creează automat un director gol pentru
 * sursa de montare: containerul pornește „cu succes", Caddy răspunde,
 * iar toate paginile dau 404. E o eroare de deploy invizibilă în
 * loguri — deci o verificăm aici, ca să nu se mai repete. */
const deploy = fs.readFileSync(path.join(MODULE_3, 'deploy-autoact.sh'), 'utf8');

/* Verificările se fac DOAR pe linii active. Altfel, o linie comentată
 * cu „#" ar satisface orice regex — o mutație care dezactivează
 * sincronizarea site-ului ar trece drept „cod valid”. */
const deployActiv = deploy.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

check(/scp\s+-r\s+\.\.\/site/.test(deployActiv),
  'deploy: sincronizează site-ul pe server (scp -r)',
  'fără asta, sursa de montare lipsește, Docker creează director gol și paginile dau 404');
check(/scp\s+docker-compose\.yml/.test(deployActiv) && /scp\s+caddy\/Caddyfile/.test(deployActiv),
  'deploy: trimite compose + Caddyfile');

/* Montarea din compose trebuie să corespundă directorului sincronizat. */
const compose = fs.readFileSync(path.join(MODULE_3, 'docker-compose.yml'), 'utf8');
check(/srv/.test(compose) && compose.includes('../site'),
  'compose: site-ul e montat în /srv (read-only)',
  'montare negăsită în docker-compose.yml');

/* Verificarea de pe server trebuie să existe: e cea care oprește un
 * deploy pe jumătate. Căutăm ASIGNAREA activă, nu orice apariție a
 * numelui de variabilă — altfel referințele rămase în `if` ar trece. */
const areVerificarePagini = /^\s*PAGINI_ONLINE=\$\(/m.test(deployActiv) &&
  /PAGINI_ONLINE.*-lt/.test(deployActiv) &&
  /exit 1/.test(deployActiv.slice(deployActiv.indexOf('PAGINI_ONLINE=$(')));
check(areVerificarePagini,
  'deploy: verifică numărul de pagini pe server și oprește dacă sunt prea puține',
  'fără verificare, deploy-ul reușește tăcut cu un site gol');

/* Fișierele de test și șabloanele nu au ce căuta pe server public. */
check(/rm\s+-f.*site\/\*\.sablon\.html/.test(deployActiv),
  'deploy: șterge de pe server șabloanele și testele (nu sunt de servit)');

/* ---------- 7. Curățenie ---------- */
curataza();

console.log('');
console.log('test-caddy-rutare: ' + total + ' verificări · ' + esecuri + ' eșuate');
if (esecuri > 0) {
  console.error('Caddy nu rutează corect: paginile publice și backend-ul se suprapun.');
  process.exit(1);
}
console.log('Site-ul public, API-ul și interfața n8n sunt separate corect. ✔');