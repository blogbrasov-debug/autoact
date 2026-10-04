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

/* ---------- Prețul: o singură față, în lei, TVA inclus ---------- */
/* Decizia (3 oct. 2026, măsurată pe Stripe sandbox): clientul plătește
 * 49 RON, TVA inclus, prin Stripe în rol de Merchant of Record. Nu mai
 * există a doua față în euro și deci nici curs de control — comparația
 * 9,16 € vs 49 lei costa 1,07 lei/tranzacție (net 36,89 față de 37,96),
 * plus o dependență de curs care nu poate fi auditată. Prețul se
 * încasează în aceeași monedă în care e contractat: zero conversie. */
const PRET_RON = Number(unica('PRET_RON', /PRET_RON\s*:\s*\d+/).match(/\d+/)[0]);
if (!Number.isInteger(PRET_RON) || PRET_RON <= 0) {
  throw new Error('site/config.js: PRET_RON trebuie să fie un întreg pozitiv.');
}
/* Textul afișat pe site: „49 lei”. */
const PRET_AFISAT = PRET_RON + ' lei';

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
  [RETENTION_H]: 'retenția GDPR promisă pe pagina de contact (verificată contra module-4/gdpr-purge.sql)',
  72: 'retenția maximă a dosarelor fără plată (verificată contra module-4/gdpr-purge.sql)',
  14: 'termenul legal de retragere — norma consumatorului, nu o alegere comercială',
  34: 'OUG 34/2014 — norma care reglementează dreptul de retragere al consumatorului',
  22: 'art. 22 GDPR — deciziile automatizate',
  30: 'termenul legal de răspuns la o cerere GDPR (luni)'
};

/* ---------- Termeni și GDPR: cele două decizii pe care legea nu le dictează ---------- */
/* Citite tot din site/config.js, ca o pagină de termeni să nu poată avea
 * altă dată sau altă instanță decât restul proiectului. */
const LEGAL = {
  DATA_ACCEPTARE: textUnic('LEGAL.DATA_ACCEPTARE', /DATA_ACCEPTARE\s*:\s*'[^']*'/g),
  INSTANTE: textUnic('LEGAL.INSTANTE', /INSTANTE\s*:\s*'[^']*'/g)
};
/* Data trebuie să fie o zi calendaristică reală, pentru că se afișează
 * public și nimeni nu mai poate verifica o dată care nu există. */
if (!/^\d{4}-\d{2}-\d{2}$/.test(LEGAL.DATA_ACCEPTARE) || Number.isNaN(Date.parse(LEGAL.DATA_ACCEPTARE))) {
  throw new Error('site/config.js: LEGAL.DATA_ACCEPTARE trebuie să fie o dată YYYY-MM-DD — este „' + LEGAL.DATA_ACCEPTARE + '”.');
}
if (!LEGAL.INSTANTE.trim()) throw new Error('site/config.js: LEGAL.INSTANTE e gol.');

/* Un același lucru ca la NAP: cât timp e PLACEHOLDER, paginile /termeni
 * și /gdpr NU pot fi publicate, pentru că nu spun data reală de la care
 * se aplică și nici unde se rezolvă disputele. */
const PLACEHOLDER_LEGAL =
  /înlocuiește/i.test(LEGAL.DATA_ACCEPTARE) ||
  /înlocuiește|\{\{/i.test(LEGAL.INSTANTE);

/* ---------- Stripe: identificatorii reali, citiți din config.js ---------- */
/* ID-urile sunt publice prin natura lor (Payment Link-ul apare în
 * payload-ul răspunsului către client), dar nu trebuie scrise în
 * workflow-uri sau șabloane cu gura: le generăm de aici, ca o
 * schimbare de cont Stripe să fie o editare într-un singur loc. */
const STRIPE = {
  PRODUS_ID: textUnic('STRIPE.PRODUS_ID', /PRODUS_ID\s*:\s*'[^']*'/g),
  PRET_ID: textUnic('STRIPE.PRET_ID', /PRET_ID\s*:\s*'[^']*'/g),
  PAYMENT_LINK: textUnic('STRIPE.PAYMENT_LINK', /PAYMENT_LINK\s*:\s*'[^']*'/g),
  COD_FISCAL: textUnic('STRIPE.COD_FISCAL', /COD_FISCAL\s*:\s*'[^']*'/g),
  WEBHOOK_URL: textUnic('STRIPE.WEBHOOK_URL', /WEBHOOK_URL_STRIPE\s*:\s*'[^']*'/g)
};
/* Payment Link-ul trebuie să fie o adresă https reală — altfel
 * butonul de plată ar trimite clientul în gol. */
if (!/^https:\/\/buy\.stripe\.com\/[A-Za-z0-9_]+$/.test(STRIPE.PAYMENT_LINK)) {
  throw new Error(
    'site/config.js: STRIPE.PAYMENT_LINK nu arată ca un Payment Link Stripe — este „' + STRIPE.PAYMENT_LINK + '”.'
  );
}
/* Codul fiscal (tax code) e cel care face produsul „Eligible for
 * Managed Payments”; un id greșit înseamnă că Stripe nu colectează
 * TVA și nu poate scoate factură în numele nostru. */
if (!/^txcd_[0-9A-Za-z]+$/.test(STRIPE.COD_FISCAL)) {
  throw new Error('site/config.js: STRIPE.COD_FISCAL trebuie să fie un id txcd_… — este „' + STRIPE.COD_FISCAL + '”.');
}
/* Stripe e Merchant of Record: el emite documentul fiscal și îl
 * trimite clientului. Fără URL de webhook nu știm când s-a plătit. */
if (!/^https:\/\/[a-z0-9.-]+\/webhook\/stripe$/.test(STRIPE.WEBHOOK_URL)) {
  throw new Error('site/config.js: STRIPE.WEBHOOK_URL trebuie să fie URL-ul public al webhook-ului Stripe (…/webhook/stripe) — este „' + STRIPE.WEBHOOK_URL + '”.');
}

/* ---------- Decizia fiscală: procesator + prag de regularizare ----------
 * Citite din site/config.js ca să nu existe o cifră scrisă în două locuri.
 * PROCESATOR = 'stripe' → Stripe e Merchant of Record („Managed
 * Payments”): el e vânzătorul de drept, emite factura și reține TVA,
 * deci NU e nevoie de CUI ca să încasăm.
 * PRAG_COMENZI_REGULARIZARE = de la când se oprește vânzarea și se face CUI/PFA. */
const PROCESATOR_PLATI = unica('PLATARI.PROCESATOR', /PROCESATOR\s*:\s*'[^']*'/g).match(/'([^']*)'/)[1];
if (!PROCESATOR_PLATI.trim()) throw new Error('site/config.js: PLATARI.PROCESATOR e gol.');
const PRAG_REGULARIZARE = Number(
  unica('PLATARI.PRAG_COMENZI_REGULARIZARE', /PRAG_COMENZI_REGULARIZARE\s*:\s*\d+/).match(/\d+/)[0]
);
if (!Number.isInteger(PRAG_REGULARIZARE) || PRAG_REGULARIZARE <= 0) {
  throw new Error('site/config.js: PLATARI.PRAG_COMENZI_REGULARIZARE trebuie să fie un întreg pozitiv.');
}

/* ---------- Stripe live sau sandbox? Un singur comutator ---------- */
/* În test mode o plată „reușită” înseamnă zero bani, iar în live mode
 * nimeni nu mai poate măsura ieftin. Singura greșeală care costă real e
 * inversul ei: un link de test publicat pe pagină, sau un link live
 * crezut „de test” și abandonat. De aceea coerența dintre comutator și
 * link se verifică aici, la citirea configului — înainte de build. */
const LIVE_STRIPE =
  unica('PLATARI.LIVE', /\bLIVE\s*:\s*(?:true|false)/g).match(/true|false/)[0] === 'true';

/* Funcție separată de apelul de mai jos ca să poată fi testată cu valori
 * greșite fără a modifica fișierul de pe disc (vezi test-mutatie). */
function verificaLegaturaStripe(live, paymentLink) {
  if (typeof live !== 'boolean') {
    throw new Error(
      'site/config.js: PLATARI.LIVE trebuie boolean (true sau false) — o valoare ca ' +
      typeof live + ' face ca un link de test să pară live și invers.'
    );
  }
  const esteLive = /\/live_[A-Za-z0-9_]+$/.test(paymentLink);
  const esteTest = /\/test_[A-Za-z0-9_]+$/.test(paymentLink);
  if (live && !esteLive) {
    throw new Error(
      'site/config.js: PLATARI.LIVE = true, dar STRIPE.PAYMENT_LINK este un link de test (' +
      paymentLink + '). Niciun client nu ar plăti nimic, iar tu ai crede că ai vânzări. ' +
      'Pune linkul live sau lasă LIVE = false.'
    );
  }
  if (!live && !esteTest) {
    throw new Error(
      'site/config.js: PLATARI.LIVE = false (test mode), dar STRIPE.PAYMENT_LINK este un link ' +
      'live (' + paymentLink + '). Contul de test nu are obiectul acela: măsurătorile din ' +
      'sandbox ar plăti de două ori, iar orice test ar încasa bani reali.'
    );
  }
  return esteLive;
}
const LINK_STRIPE_E_LIVE = verificaLegaturaStripe(LIVE_STRIPE, STRIPE.PAYMENT_LINK);

module.exports = {
  PRET_RON, PRET_AFISAT, NAP, PLACEHOLDER_NAP, RETENTION_H, EXCEPTII_CIFRE, CONFIG, CHEIE_CIF,
  cifraControlCif, PROCESATOR_PLATI, PRAG_REGULARIZARE, STRIPE, LEGAL, PLACEHOLDER_LEGAL,
  LIVE_STRIPE, LINK_STRIPE_E_LIVE, verificaLegaturaStripe
};
