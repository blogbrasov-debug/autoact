/* ============================================================
 * AutoAct | site/test-mutatie-pagini-legale.js
 * Test de MUTAȚIE pentru verificările din test-banca-cifre.js
 * despre paginile /termeni și /gdpr.
 * Rulează: node site/test-mutatie-pagini-legale.js
 *
 * DE CE: o pagină de termeni sau de GDPR care SPUNE ceva fals este
 * mai rea decât una lipsă — pentru că pare conformă. Iar afirmațiile
 * ei sunt exact genul care se degradează în tăcere: adaugi un
 * furnizor nou în workflow și uiți să-l declari, sau schimbi un
 * prag de retenție în SQL și uiți pagina.
 *
 * Fiecare mutație de mai jos reproduce una din aceste situații, iar
 * verificarea TREBUIE să cadă. O verificare care doar „merge" nu
 * dovedește că verifică ceva.
 * ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RAD = path.join(__dirname, '..');
const BANCA = path.join(__dirname, 'test-banca-cifre.js');

const MUTATII = [
  {
    nume: 'furnizor declarat în gdpr.html care NU e folosit de workflow (Oracle → „Amazon AWS”)',
    fisier: path.join(RAD, 'site', 'gdpr.sablon.html'),
    aplica: (t) => t.replace('<td>găzduirea serverului (n8n și baza de date).</td>',
      '<td>respingerea automată a solicitărilor.</td>').replace('<tr><th scope="row">Oracle Cloud</th>',
      '<tr><th scope="row">Amazon AWS</th>')
  },
  {
    nume: 'termen de retenție schimbat în pagină (72h) dar păstrat în SQL',
    fisier: path.join(RAD, 'site', 'gdpr.sablon.html'),
    aplica: (t) => t.replace('72 de ore', '96 de ore')
  },
  {
    nume: 'NAP scris cu mâna în șablon, în loc de token ({{ADRESA}} → valoare)',
    fisier: path.join(RAD, 'site', 'termeni.sablon.html'),
    aplica: (t) => t.replace('sediul în {{ADRESA}}', 'sediul în Str. Exemplu 1, Sector 1, București')
  },
  {
    nume: 'prag GDPR schimbat în SQL, pagina nemenționată (48h → 96h)',
    fisier: path.join(RAD, 'module-4', 'gdpr-purge.sql'),
    aplica: (t) => t.replace("INTERVAL '48 hours'", "INTERVAL '96 hours'")
  },
  {
    nume: 'blocajul de deploy pentru paginile legale eliminat cu totul',
    fisier: path.join(RAD, 'module-3', 'deploy-autoact.sh'),
    aplica: (t) => t.replace(/AUTOACT_LEGAL_PLACEHOLDER=.*\n/, '').replace(/if \[ "\$AUTOACT_LEGAL_PLACEHOLDER".*?\nfi\n/, '')
  },
  {
    nume: 'marcajul de necompletat scos din pagină, config.js rămâne necompletat',
    fisier: path.join(RAD, 'site', 'gdpr.sablon.html'),
    aplica: (t) => t.replace(' Unde se rezolvă disputele: {{LEGAL_INSTANTE}}', '')
  }
];

let total = 0, esecuri = 0;
const check = (cond, mesaj, detaliu) => {
  total++;
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + mesaj + (!cond && detaliu ? '  → ' + detaliu : ''));
  if (!cond) esecuri++;
};

/* Rulează BANCA pe starea curentă a arborelui. */
const ruleazaBanca = () => {
  try {
    const out = execFileSync('node', [BANCA], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { cod: 0, out };
  } catch (e) {
    return { cod: e.status === undefined ? 1 : e.status, out: (e.stdout || '') + (e.stderr || '') };
  }
};

const BAK = path.join(__dirname, '_bk-legale');
fs.mkdirSync(BAK, { recursive: true });
const salvate = MUTATII.map((m) => {
  const copie = path.join(BAK, path.basename(m.fisier));
  fs.copyFileSync(m.fisier, copie);
  fs.writeFileSync(copie + '.mtime', String(fs.statSync(m.fisier).mtimeMs));
  return { m, copie, mtime: fs.statSync(m.fisier).mtimeMs };
});

try {
  /* Mutațiile ating șabloane, deci paginile generate trebuie re-randate
   * înainte de a verifica altfel am muta ceva ce nu ajunge la verificare. */
  const reRandeaza = () => {
    try {
      execFileSync('node', [path.join(RAD, 'site', 'construieste-inline.js')], { stdio: 'ignore' });
    } catch (e) { /* un șablon rupt trebuie să facă verificarea să cadă, nu build-ul să tacă */ }
  };
  const restaureaza = () => {
    for (const s of salvate) {
      fs.writeFileSync(s.m.fisier, fs.readFileSync(s.copie, 'utf8'));
      fs.utimesSync(s.m.fisier, s.mtime / 1000, s.mtime / 1000);
    }
    reRandeaza();
  };

  restaureaza();
  const curat = ruleazaBanca();
  check(curat.cod === 0, 'banca de cifre trece pe starea de bază (înainte de orice mutație)',
    curat.out.split('\n').find((l) => l.startsWith('FAIL')) || '');

  for (const m of MUTATII) {
    const original = fs.readFileSync(m.fisier, 'utf8');
    const mutant = m.aplica(original);
    check(mutant !== original, 'mutația „' + m.nume + '” se aplică efectiv',
      'nu s-a găsit textul de înlocuit — ar trece prin lipsa ei, nu prin a verificării');
    fs.writeFileSync(m.fisier, mutant);
    reRandeaza();

    const r = ruleazaBanca();
    restaureaza();

    const primaLinie = r.out.split('\n').find((l) => l.startsWith('FAIL')) || '';
    check(r.cod !== 0, 'verificarea CADE la: ' + m.nume + ' (exit ' + r.cod + ')',
      primaLinie ? 'a căzut fără mesaj' : 'a trecut — verificarea nu controlează ce pretinde că controlează');
    if (primaLinie) console.log('        ' + primaLinie.trim().slice(0, 150));
  }
} finally {
  fs.rmSync(BAK, { recursive: true, force: true });
}

const final = ruleazaBanca();
check(final.cod === 0, 'sursele restaurate integral — banca trece din nou',
  final.out.split('\n').find((l) => l.startsWith('FAIL')) || '');

console.log('');
console.log('site/test-mutatie-pagini-legale: ' + total + ' verificări · ' + esecuri + ' eșuate');
if (esecuri > 0) {
  console.error('Verificările paginilor legale nu mușcă. Nu te baza pe ele până nu sunt reparate.');
  process.exit(1);
}
console.log('Pagina legală nu poate înceta să corespundă codului fără ca testul să cadă. ✔');