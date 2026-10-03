/* ============================================================
 * AutoAct | config-autoact.js — CITITORUL UNIC AL CONFIGURAȚIEI
 * ============================================================
 * site/config.js e singurul fișier de editat la deploy. Acest modul
 * e singurul mod prin care codul Node (build-uri, teste) află
 * valorile de acolo — nu hardcodăm nicăieri prețul sau NAP-ul.
 *
 *   const { PRET_RON, NAP } = require('./config-autoact.js');
 *
 * Browserul folosește direct window.AUTOACT_CONFIG; textul PUBLIC
 * (HTML, JSON-LD) nu conține cifre scrise manual — sunt generate
 * din acest modul (tokenuri {{PRET_RON}}, {{CIF}}… în *.sablon.html),
 * iar site/test-banca-cifre.js CADE dacă apare în pagină o valoare
 * care nu vine din config.js.
 * ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const CONFIG = path.join(__dirname, 'site', 'config.js');
const SRC = fs.readFileSync(CONFIG, 'utf8');

/* Extrage o valoare unică din config.js și CADE dacă există mai multe
 * apariții — o sursă duplicată e mai periculoasă decât una lipsă. */
function unica(eticheta, regex) {
  const gasite = SRC.match(regex) || [];
  if (gasite.length !== 1) {
    throw new Error(
      'site/config.js: așteptam exact o apariție pentru ' + eticheta +
      ', am găsit ' + gasite.length + ' — banca de cifre / NAP nu poate fi rezolvată.'
    );
  }
  return gasite[0];
}

const textUnic = (eticheta, regex) => {
  const gasite = SRC.match(regex) || [];
  if (gasite.length !== 1) {
    throw new Error('site/config.js: așteptam exact o apariție pentru ' + eticheta + ', am găsit ' + gasite.length + '.');
  }
  const v = gasite[0].match(/:\s*'([^']*)'/)[1];
  if (!v.trim()) throw new Error('site/config.js: ' + eticheta + ' e gol.');
  return v;
};

/* ---------- Prețul ---------- */
const PRET_RON = Number(unica('PRET_RON', /PRET_RON\s*:\s*\d+/).match(/\d+/)[0]);
if (!Number.isInteger(PRET_RON) || PRET_RON <= 0) {
  throw new Error('site/config.js: PRET_RON trebuie să fie un întreg pozitiv.');
}

/* ---------- NAP (nume, adresă, contact) — sursa unică ---------- */
const NAP = {
  DENUMIRE: textUnic('NAP.DENUMIRE', /DENUMIRE\s*:\s*'[^']*'/g),
  CIF: textUnic('NAP.CIF', /CIF\s*:\s*'[^']*'/g),
  REG_COM: textUnic('NAP.REG_COM', /REG_COM\s*:\s*'[^']*'/g),
  ADRESA: textUnic('NAP.ADRESA', /ADRESA\s*:\s*'[^']*'/g),
  TELEFON: textUnic('NAP.TELEFON', /TELEFON\s*:\s*'[^']*'/g),
  EMAIL: textUnic('NAP.EMAIL', /EMAIL\s*:\s*'[^']*'/g),
  SITE: textUnic('NAP.SITE', /SITE\s*:\s*'[^']*'/g)
};

/* CIF-ul e cel mai riscant: o eroare de o cifră înseamnă factură
 * greșită și neconformitate fiscală. Îl validăm aici, ca o cifră
 * greșită să nu ajungă niciodată în JSON-LD, pe pagină sau în footer.
 * Algoritmul canonic (Legea 359/2004): cheia „753217532”, cifra de
 * control e ultima, baza se completează cu zerouri la stânga până la
 * lungimea cheii și se înmulțește cu indexare INVERSĂ. */
const CHEIE_CIF = '753217532';
function cifraControlCif(cif) {
  const control = Number(cif.slice(-1));
  let baza = cif.slice(0, -1);
  while (baza.length < CHEIE_CIF.length) baza = '0' + baza;
  let s = 0;
  for (let i = baza.length - 1; i >= 0; i--) s += Number(baza[i]) * Number(CHEIE_CIF[i]);
  const calc = (s * 10) % 11;
  return { control, calc: calc === 10 ? 0 : calc };
}
const faraPrefix = NAP.CIF.toUpperCase().replace(/\s/g, '').replace(/^RO/, '');
if (!/^\d{2,10}$/.test(faraPrefix)) {
  throw new Error('site/config.js: NAP.CIF trebuie să fie 2–10 cifre (eventual cu prefix RO) — este „' + NAP.CIF + '”.');
}
const { control, calc } = cifraControlCif(faraPrefix);
if (control !== calc) {
  throw new Error(
    'site/config.js: NAP.CIF „' + NAP.CIF + '” are cifra de control „' + control +
    '”, dar algoritmul canonic (cheia ' + CHEIE_CIF + ') dă „' + calc +
    '”. O cifră greșit aici înseamnă facturi neconforme — corectează înainte de deploy.'
  );
}

/* Placeholder-ele din repo: cât timp sunt astea în config.js, NAP-ul
 * e de umplut. Nu blochează testele (altfel n-ar mai putea fi livrat
 * codul), dar se spun explicit la fiecare rulare. */
const PLACEHOLDER_NAP = /00000|EXEMPLU/i.test(NAP.CIF + NAP.REG_COM + NAP.ADRESA);

/* Retenția GDPR: pagina de contact promite când se șterg datele, iar
 * job-ul din module-4/gdpr-purge.sql trebuie să facă exact asta. E o
 * singură valoare folosită în ambele locuri, iar testul verifică
 * coerența — altfel pagina promite 48h și scriptul curăță la 72h. */
const RETENTION_H = 48;

/* Sume/valori care apar în teste și în cod și sunt legitim diferite
 * de preț. Declarate aici ca să poată fi citite de orice suită. */
const EXCEPTII_CIFRE = {
  9500: 'placeholder de exemplu în câmpul „Prețul de vânzare” (nu e prețul AutoAct)',
  24: 'prag legal — scutire taxă transcriere pentru mașini sub 24 de luni',
  [RETENTION_H]: 'retenția GDPR promisă pe pagina de contact (verificată contra module-4/gdpr-purge.sql)'
};

module.exports = { PRET_RON, NAP, PLACEHOLDER_NAP, RETENTION_H, EXCEPTII_CIFRE, CONFIG, CHEIE_CIF, cifraControlCif };