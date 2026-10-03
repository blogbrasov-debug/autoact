/* ============================================================
 * AutoAct | brand/exporta-png.js
 * Randează materialele de identitate în PNG-uri gata de upload.
 * ============================================================
 * Facebook nu acceptă SVG la upload — doar PNG și JPEG. Nu există
 * rasterizator pe mașina de dezvoltare (nici ImageMagick, nici
 * librsvg, nici PIL), așa că singura cale fiabilă e un browser
 * headless: randează exact aceleași fișiere HTML din care designerul
 * vede previzualizarea, deci PNG-ul nu poate diverge de sursă.
 *
 * Dimensiunile NU sunt alese aici: sunt citite din cadrul generat
 * de construieste-identitate.js. Dacă acolo se schimbă lățimea, și
 * captura se schimbă — altfel am trimite la Meta o imagine de
 * dimensiune greșită fără niciun avertisment.
 *
 * Rulează:  node brand/exporta-png.js
 * Ieșire:   brand/png/*.png, la dimensiunile cerute de Meta
 * ============================================================ */
'use strict';

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const RADACINA = path.join(__dirname, '..');
const BRAND = __dirname;
const OUT = path.join(BRAND, 'png');

let total = 0, esecuri = 0;
const check = (cond, mesaj, detaliu) => {
  total++;
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + mesaj + (!cond && detaliu ? '  → ' + detaliu : ''));
  if (!cond) esecuri++;
};

/* ---------- 1. Browser headless ---------- */
function gasesteBrowser() {
  const cand = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
  ];
  for (const c of cand) if (fs.existsSync(c)) return c;
  return null;
}

const browser = gasesteBrowser();
if (!browser) {
  console.error('Nu găsesc Chrome sau Edge pentru randare headless.');
  console.error('Alternativă: deschide brand/*.html în browser și salvează captura manual.');
  process.exit(1);
}
console.log('Browser: ' + path.basename(browser));
console.log('');

/* ---------- 2. Dimensiunile vin din fișierele generate ---------- */
/* Citim lățimea/înălțimea din `.cadru` din fiecare HTML. De aici pornește
 * și un eventual drift: dacă generatorul produce altă dimensiune,
 * PNG-ul o urmează — nu o ghicim. */
const CADRURI = [
  { html: 'facebook-acoperire.html', nume: 'facebook-acoperire.png' },
  { html: 'facebook-profil.html', nume: 'facebook-profil.png' },
  { html: 'facebook-post-durata.html', nume: 'facebook-post-durata.png' },
  { html: 'facebook-post-proces.html', nume: 'facebook-post-proces.png' },
  { html: 'facebook-post-intrebare.html', nume: 'facebook-post-intrebare.png' }
];

for (const c of CADRURI) {
  const p = path.join(BRAND, c.html);
  if (!fs.existsSync(p)) { console.error('Lipsește ' + c.html + ' — rulează întâi construieste-identitate.js'); process.exit(1); }
  const m = fs.readFileSync(p, 'utf8').match(/\.cadru\s*\{[^}]*width:\s*(\d+)px;\s*height:\s*(\d+)px/);
  c.latime = m ? Number(m[1]) : 0;
  c.inaltime = m ? Number(m[2]) : 0;
  check(c.latime > 0 && c.inaltime > 0,
    'dimensiuni citite din ' + c.html + ': ' + c.latime + '×' + c.inaltime);
}

/* ---------- 3. Server local temporar ----------
 * `file://` cu Chrome headless e fiabil doar pentru HTML simplu; un
 * server local evită orice restricție de CORS sau de acces la fișiere
 * și ne dă control pe MIME. */
const PORT = 8177;
fs.mkdirSync(OUT, { recursive: true });

const server = http.createServer((req, res) => {
  const f = path.join(BRAND, decodeURIComponent(req.url.split('?')[0]));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
  const tip = f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.svg') ? 'image/svg+xml' : 'text/plain';
  res.writeHead(200, { 'Content-Type': tip });
  res.end(fs.readFileSync(f));
});

/* Randarea trebuie să fie ASINCRONĂ: `execFileSync` ar bloca bucla de
 * evenimente, deci serverul local n-ar putea răspunde cererii lui Chrome
 * în timpul execuției — browserul ar aștepta la nesfârșit până la
 * timeout, la fiecare imagine. Așa, serverul servește cât timp Chrome
 * randează. */
function randeaza(c) {
  return new Promise((rezolva) => {
    const iesire = path.join(OUT, c.nume);
    const args = [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-sandbox',
      '--user-data-dir=' + profilUtil,
      '--force-device-scale-factor=1',
      '--window-size=' + c.latime + ',' + c.inaltime,
      '--screenshot=' + iesire,
      'http://127.0.0.1:' + PORT + '/' + c.html
    ];
    execFile(browser, args, { timeout: 90000 }, (e) => {
      if (e) {
        check(false, 'randare: ' + c.nume, 'browserul a eșuat: ' + e.message);
        return rezolva();
      }
      const marime = fs.existsSync(iesire) ? fs.statSync(iesire).size : 0;
      check(marime > 2000,
        'randare: ' + c.nume + ' (' + c.latime + '×' + c.inaltime + ', ' + Math.round(marime / 1024) + ' KB)');
      rezolva();
    });
  });
}

const profilUtil = path.join(require('os').tmpdir(), 'autoact-chrome-brand');

server.listen(PORT, async () => {
  /* ---------- 4. Randare ---------- */
  console.log('');

  for (const c of CADRURI) await randeaza(c);

  /* Chrome lasă un profil temporar; nu îl lăsăm în sistem. */
  try { fs.rmSync(profilUtil, { recursive: true, force: true }); } catch (e) { /* ignorat */ }
  server.close();

  /* ---------- 5. PNG-urile chiar sunt PNG și au dimensiunea cerută ---------- */
  console.log('');
  for (const c of CADRURI) {
    const p = path.join(OUT, c.nume);
    if (!fs.existsSync(p)) { check(false, 'validare PNG: ' + c.nume, 'fișierul nu există'); continue; }
    const fd = fs.openSync(p, 'r');
    const antet = Buffer.alloc(24);
    fs.readSync(fd, antet, 0, 24, 0);
    fs.closeSync(fd);

    const estePNG = antet.toString('hex', 0, 8) === '89504e470d0a1a0a';
    const lat = antet.readUInt32BE(16);
    const inalt = antet.readUInt32BE(20);

    check(estePNG, 'validare PNG: ' + c.nume + ' e fișier PNG real',
      'semnătura invalidă: ' + antet.toString('hex', 0, 8));
    check(lat === c.latime && inalt === c.inaltime,
      'validare PNG: ' + c.nume + ' are exact ' + c.latime + '×' + c.inaltime,
      'citit ' + lat + '×' + inalt);
  }

  console.log('');
  console.log('exporta-png: ' + total + ' verificări · ' + esecuri + ' eșuate');
  if (esecuri > 0) {
    console.error('Nu toate materialele au fost randate corect — nu le încărca pe Facebook.');
    process.exit(1);
  }
  console.log('Materialele sunt PNG-uri la dimensiunile cerute de Meta, în brand/png/. ✔');
});