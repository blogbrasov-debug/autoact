/**
 * AutoAct | module-2 | verifica-sabloane.js
 * Verifică integritatea șabloanelor:
 *   (1) token-urile din .md apar TODOS în placeholders.json;
 *   (2) fiecare cale din placeholders.json se rezolvă pe Profilul
 *       de Tranzacție demo (module-1/tranzactie-demo.json, generat
 *       de populeaza-tranzactie-demo.js);
 *   (3) toate valorile rezolvate sunt non- Vide (string/număr valid).
 * Rulare:  node module-1/populeaza-tranzactie-demo.js  (dacă lipsește demo)
 *          node module-2/verifica-sabloane.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const sabloaneDir = path.join(__dirname, 'sabloane');
const sabloane = ['contract-vanzare-cumparare-auto.md', 'cerere-drpciv.md', 'declaratie-fiscala.md'];

const harta = JSON.parse(fs.readFileSync(path.join(sabloaneDir, 'placeholders.json'), 'utf8')).placeholders;

function obtineCale(obj, cale) {
  return cale.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

let esecuri = 0;
const assert = (cond, mesaj, detaliu) => {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + mesaj + (detaliu ? '  [' + detaliu + ']' : ''));
  if (!cond) esecuri++;
};

/* ---------- Profil demo (regenerat dacă lipsește) ---------- */
const demoPath = path.join(__dirname, '..', 'module-1', 'tranzactie-demo.json');
if (!fs.existsSync(demoPath)) {
  require('child_process').execSync('node ' + path.join(__dirname, '..', 'module-1', 'populeaza-tranzactie-demo.js'), { stdio: 'inherit' });
}
const profil = JSON.parse(fs.readFileSync(demoPath, 'utf8'));

/* ---------- 1. Token-urile din șabloane sunt toate în hartă ---------- */
const totiTokenii = new Set();
for (const nume of sabloane) {
  const text = fs.readFileSync(path.join(sabloaneDir, nume), 'utf8');
  const tokeni = Array.from(text.matchAll(/\{\{([a-z_0-9]+)\}\}/g)).map((m) => m[1]);
  for (const t of tokeni) totiTokenii.add(t);
  const necunoscuti = tokeni.filter((t) => !harta[t]);
  assert(necunoscuti.length === 0, nume + ' — toți tokenii existenți în hartă', necunoscuti.join(', '));
  assert(tokeni.length >= 10, nume + ' — conține tokeni (>= 10)', tokeni.length + ' găsiți');
}

/* ---------- 2. Fiecare cale din hartă se rezolvă pe profil ---------- */
const rezolvate = {};
for (const [placeholder, cale] of Object.entries(harta)) {
  const val = obtineCale(profil, cale);
  const valid = val !== undefined && val !== null && String(val).trim() !== '';
  rezolvate[placeholder] = val === undefined || val === null ? '' : String(val);
  assert(valid, 'hartă → profil: ' + placeholder + ' ← ' + cale, valid ? '= "' + String(val).slice(0, 30) + '"' : 'VALOARE LIPSĂ');
}

/* ---------- 3. Token-urile critice apar efectiv în șabloane ---------- */
const critice = ['vanzator_nume', 'vanzator_cnp', 'cumparator_nume', 'cumparator_cnp', 'vehicul_vin', 'vehicul_placuta', 'suma_ron', 'data_vanzarii', 'tranzactie_numar'];
const contractText = fs.readFileSync(path.join(sabloaneDir, 'contract-vanzare-cumparare-auto.md'), 'utf8');
for (const c of critice) {
  assert(contractText.includes('{{' + c + '}}'), 'contractul folosește placeholder-ul critic {{' + c + '}}');
}

/* ---------- 4. Pre-view: primele 10 înlocuiri, ca mostră ---------- */
console.log('\n--- Mostră de înlocuire (contract, primele 10) ---');
let aratate = 0;
const textFinal = contractText.replace(/\{\{([a-z_0-9]+)\}\}/g, (potrivire, t) => {
  if (aratate < 10 && harta[t]) {
    aratate++;
    console.log('  {{' + t + '}} → "' + rezolvate[t] + '"');
  }
  return rezolvate[t] || potrivire;
});
const ramasi = (textFinal.match(/\{\{[a-z_0-9]+\}\}/g) || []).filter((t) => harta[t.slice(2, -2)]);
assert(ramasi.length === 0, 'după înlocuire nu rămân placeholder-e necompletate', ramasi.join(', '));

/* ---------- 5. Harta din nodul „Documente ZIP” = harta canonică (placeholders.json) ---------- */
const builderPath = path.join(__dirname, 'build-workflow.js');
const builderSrc = fs.readFileSync(builderPath, 'utf8');
const mStart = builderSrc.indexOf('const HARTA = {');
const mEnd = builderSrc.indexOf('};', mStart);
assert(mStart !== -1 && mEnd !== -1, 'build-workflow.js — harta HARTA găsită în nodul Documente ZIP');
if (mStart !== -1 && mEnd !== -1) {
  const fragment = builderSrc.slice(mStart, mEnd);
  const perechi = Array.from(fragment.matchAll(/([a-z_0-9]+):\s*'([^']+)'/g));
  const hartaNod = Object.fromEntries(perechi.map(([, k, v]) => [k, v]));
  const cheiNod = Object.keys(hartaNod);
  const cheiHarta = Object.keys(harta);
  const diferite = cheiNod.filter((k) => harta[k] !== hartaNod[k]);
  assert(cheiNod.length === cheiHarta.length && diferite.length === 0,
    'nodul Documente ZIP folosește EXACT harta canonică placeholders.json (' + cheiHarta.length + ' intrări, zero diferențe)',
    cheiNod.length + ' în nod vs ' + cheiHarta.length + ' în hartă' + (diferite.length ? ' | diferențe: ' + diferite.join(', ') : ''));
}

console.log('\n============================================================');
console.log('TOTAL: ' + (esecuri === 0 ? 'TOATE' : esecuri + ' EȘUATE Din') + ' verificările șabloanelor');
console.log(esecuri === 0 ? 'ȘABLOANE: TOATE TESTELE TREC ✔' : 'ȘABLOANE: EȘUAT ✘');
console.log('============================================================');
process.exit(esecuri === 0 ? 0 : 1);
