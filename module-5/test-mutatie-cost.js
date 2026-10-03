/* ============================================================
 * AutoAct | module-5/test-mutatie-cost.js
 * TEST DE MUTAȚIE pentru gardul de buget.
 * ============================================================
 * Un test care „merge" nu dovedește că verifică ceva. Acesta introduce
 * deliberat încălcări în fișierele reale și cere ca verifiescost-0 să
 * CADĂ — pentru fiecare clasă de încălcare, nu doar pentru un caz.
 *
 * Fiecare mutație e aplicată pe fișierul real, se rulează gardul, apoi
 * fișierul e RESTAURAT din backup. La final se cere explicit ca
 * arborele să fie identic cu cel de pornire: altfel un gard care pică
 * pentru totdeauna ar „trece" testul de mutație.
 *
 * Rulează:  node module-5/test-mutatie-cost.js
 * Ieșire:   0 = toate mutațiile au fost prinse, 1 = cel puțin una a trecut
 * ============================================================ */
'use strict';

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RADACINA = path.join(__dirname, '..');
const GARD = 'verifica-cost-0.js';

/* Calea unde copiem arborele înainte de mutații, ca restaurarea să fie
 * exactă — un `sed` invers ar putea să nu revină la starea inițială. */
const BACKUP = path.join(require('os').tmpdir(), 'autoact-mutatie-cost');

let total = 0, esecuri = 0;
const check = (cond, mesaj, detaliu) => {
  total++;
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + mesaj + (!cond && detaliu ? '  → ' + detaliu : ''));
  if (!cond) esecuri++;
};

const cale = (rel) => path.join(RADACINA, rel);
const citeste = (rel) => fs.readFileSync(cale(rel), 'utf8');
const scrie = (rel, text) => fs.writeFileSync(cale(rel), text);

/* ---------- 1. Starea de pornire trebuie să fie curată ---------- */
const baseline = spawnSync(process.execPath, [GARD], { cwd: RADACINA, encoding: 'utf8' });
check(baseline.status === 0,
  'gardul de buget e verde pe arborele neperturbat',
  'deja pică înainte de orice mutație: ' + (baseline.stdout || '').split('\n').filter((l) => l.startsWith('FAIL')).join(' | '));

/* Fișierele pe care le mutăm. */
const FISIERE = [
  'BLUEPRINT.md',
  'LAUNCH.md',
  'module-3/docker-compose.yml',
  'module-3/deploy-autoact.sh',
  'site/config.js'
];

/* ---------- 2. Backup exact ---------- */
fs.rmSync(BACKUP, { recursive: true, force: true });
const originale = new Map();
for (const f of FISIERE) {
  originale.set(f, citeste(f));
  const dest = path.join(BACKUP, f);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, originale.get(f));
}
const instaureaza = () => { for (const [f, t] of originale) scrie(f, t); };

/* ---------- 3. Mutațiile ----------
 * Fiecare are: nume, fișier, transformare text→text, și un tipar pe care
 * linia FAIL corespunzătoare trebuie să îl conțină. Fără tipar, orice
 * eșec ar trebui acceptat — inclusiv un crash de sintaxă, care ar da
 * iluzia că mutația a fost „prinsă”. */
const MUTATII = [
  {
    nume: 'cerere de 4 OCPU în documentație',
    fisier: 'LAUNCH.md',
    aplica: (t) => t.replace('**2 OCPU / 12 GB**', '**4 OCPU / 12 GB**'),
    tipar: /OCPU/
  },
  {
    nume: 'cerere de 32 GB RAM ascunsă într-un rând de tabel',
    fisier: 'BLUEPRINT.md',
    aplica: (t) => t.replace('2 OCPU / 12 GB', '2 OCPU / 32 GB'),
    tipar: /RAM/
  },
  {
    nume: 'cerere de 500 GB storage',
    fisier: 'BLUEPRINT.md',
    aplica: (t) => t.replace(/200 GB/g, '500 GB'),
    tipar: /storage/
  },
  {
    nume: 'limita de memorie eliminată de pe n8n',
    fisier: 'module-3/docker-compose.yml',
    aplica: (t) => t.replace(/\n\s*mem_limit: 4g/, ''),
    tipar: /plafon de memorie/
  },
  {
    nume: 'memorie nelimitată (mem_limit: 0)',
    fisier: 'module-3/docker-compose.yml',
    aplica: (t) => t.replace('mem_limit: 4g', 'mem_limit: 0'),
    tipar: /memorie|CPU/
  },
  {
    nume: 'limita de CPU peste plafonul Always Free',
    fisier: 'module-3/docker-compose.yml',
    aplica: (t) => t.replace('cpus: 1.0', 'cpus: 4.0'),
    tipar: /CPU/
  },
  {
    nume: 'imagine cu plată introdusă în stivă',
    fisier: 'module-3/docker-compose.yml',
    aplica: (t) => t.replace('image: caddy:2-alpine', 'image: getsentry/sentry:latest'),
    tipar: /allowlist|neaprobată/
  },
  {
    nume: 'secret Stripe scris ca literal în shell',
    fisier: 'module-3/deploy-autoact.sh',
    aplica: (t) => t.replace("printf 'STRIPE_WEBHOOK_SECRET=", "printf 'STRIPE_WEBHOOK_SECRET=whsec_0123456789abcdefRealSecret"),
    tipar: /literal/
  },
  {
    nume: 'cheia Stripe nu mai ajunge în containerul n8n',
    fisier: 'module-3/docker-compose.yml',
    aplica: (t) => t.replace('- STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}', '# cheie eliminată'),
    tipar: /STRIPE_WEBHOOK_SECRET/
  },
  {
    nume: 'revenirea la o cheie de facturare proprie (factură dublă)',
    fisier: 'module-3/docker-compose.yml',
    aplica: (t) => t.replace('      - STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}', '      - SMARTBILL_VAT_CODE=${SMARTBILL_VAT_CODE}'),
    tipar: /Netopia\/SmartBill/
  },
  {
    nume: 'parolă PostgreSQL copiată manual în loc de generată',
    fisier: 'module-3/deploy-autoact.sh',
    aplica: (t) => t.replace(/printf 'POSTGRES_PASSWORD=%s[^']*'/, "printf 'POSTGRES_PASSWORD=hunter2Fixed123'"),
    /* Două verificări legitime prind această mutație: cea care cere
     * generarea aleatorie și cea mai specifică, care cere ca valoarea să
     * nu fie scrisă chiar în formatul lui printf. Acceptăm oricare —
     * invariantul e același, iar o prindere mai strictă nu e un defect. */
    tipar: /aleator|formatul lui printf/
  },
  {
    nume: 'preț sub costul variabil estimat',
    fisier: 'site/config.js',
    aplica: (t) => t.replace('PRET_RON: 49', 'PRET_RON: 3'),
    tipar: /marjă/
  },
  {
    nume: 'config invalid (preț neîntreg)',
    fisier: 'site/config.js',
    aplica: (t) => t.replace('PRET_RON: 49', 'PRET_RON: 0.2'),
    tipar: /config\.js e valid/
  }
];

console.log('');
console.log('— Test de mutație: ' + MUTATII.length + ' încălcări injectate, una câte una —');
console.log('');

let prinse = 0;
for (const m of MUTATII) {
  const initial = originale.get(m.fisier);
  const modificat = m.aplica(initial);

  if (modificat === initial) {
    check(false, 'mutația „' + m.nume + '” se poate aplica',
      'textul nu s-a schimbat în ' + m.fisier + ' — mutația e neviabilă, testul ar trece degeaba');
    continue;
  }
  scrie(m.fisier, modificat);

  const r = spawnSync(process.execPath, [GARD], { cwd: RADACINA, encoding: 'utf8' });
  const iesire = (r.stdout || '') + (r.stderr || '');
  const areCrash = /ReferenceError|SyntaxError|TypeError/.test(iesire);
  const areFail = iesire.split('\n').filter((l) => l.startsWith('FAIL'));
  const prinsa = r.status !== 0 && !areCrash && areFail.some((l) => m.tipar.test(l));

  check(prinsa,
    'gardul prinde: ' + m.nume,
    areCrash
      ? 'gardul a CRASHAT, nu a raportat — mutația nu e verificată, ci o eroare accidentală'
      : (r.status === 0
        ? 'a trecut neobservată (gardul a rămas verde)'
        : 'a picat, dar pe alt check: ' + areFail.map((l) => l.slice(0, 70)).join(' | ')));
  if (prinsa) prinse++;

  instaureaza();
}

instaureaza();

console.log('');
console.log('mutații prinse: ' + prinse + '/' + MUTATII.length);

/* ---------- 4. Arborele a rămas neatins ---------- */
/* Fără asta, un gard care ar pica permanent ar „ține" toate mutațiile
 * și testul ar fi o iluzie. */
let murdare = [];
for (const f of FISIERE) {
  if (citeste(f) !== originale.get(f)) murdare.push(f);
}
check(murdare.length === 0,
  'niciun fișier nu a rămas modificat după mutații',
  'diferențe față de starea inițială: ' + murdare.join(', '));

const final = spawnSync(process.execPath, [GARD], { cwd: RADACINA, encoding: 'utf8' });
check(final.status === 0,
  'gardul e din nou verde pe arborele restaurat',
  (final.stdout || '').split('\n').filter((l) => l.startsWith('FAIL')).join(' | '));

fs.rmSync(BACKUP, { recursive: true, force: true });

console.log('');
console.log('test-mutatie-cost: ' + total + ' verificări · ' + esecuri + ' eșuate');
if (esecuri > 0) {
  console.error('Gardul de buget NU e de încredere: o mutație a trecut sau un crash a fost confundat cu o prindere.');
  process.exit(1);
}
console.log('Gardul pică la fiecare încălcare a bugetului. ✔');