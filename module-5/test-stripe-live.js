/* ============================================================
 * AutoAct | module-5/test-stripe-live.js
 * ============================================================
 * Verifică ce se strică în tăcere la trecerea din sandbox în LIVE:
 *
 *   1. coerența comutatorului PLATARI.LIVE cu Payment Link-ul (regula
 *      e implementă de două ori: în config-autoact.js, care CADE, și
 *      aici, ca testul să nu devină decorativ);
 *   2. ghidul module-5/configurare-stripe-live.md spunе același lucru
 *      ca codul — preț, cod fiscal, URL de webhook, eveniment, cheie
 *      din .env — și nu conține niciun secret și niciun IBAN;
 *   3. URL-ul de webhook din config e chiar cel pe care îl primește
 *      serverul (același domeniu ca NAP.SITE); o neconcordanță aici
 *      înseamnă evenimente care nu ajung nicăieri, deci niciun
 *      document generat, fără niciun mesaj de eroare;
 *   4. cât timp suntem în test mode, Nicio pagină livrată nu conține
 *      un link de plată (altfel un client ajunge într-un flux fals);
 *   5. workflow-urile generate conțin exact linkul din config.
 *
 * Ieșire: 0 = toate verificările trec, 1 = prima cădere (set -e la
 * apelator, ca în celelalte suite).
 * ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const C = require('../config-autoact.js');
const SRC_CONFIG = fs.readFileSync(C.CONFIG, 'utf8');
const Ghid = fs.readFileSync(
  path.join(__dirname, 'configurare-stripe-live.md'), 'utf8'
);

let n = 0;
let caderi = 0;
function ok(condiție, mesaj) {
  n++;
  if (condiție) {
    console.log('OK  ' + mesaj);
  } else {
    caderi++;
    console.log('FAIL ' + mesaj);
  }
}
const contine = (text, ce) => text.includes(ce);

/* ---------- 1. Comutatorul LIVE vs Payment Link ---------- */
/* Implementare independentă a regulii: dacă cineva șterge apelul din
 * config-autoact.js, gardul din cod dispare, dar această verificare
 * rămâne și continuă să cânărească. */
const liveDinConfig = /\bLIVE\s*:\s*true/.test(SRC_CONFIG);
const areLive = /\bLIVE\s*:\s*false/.test(SRC_CONFIG);
ok(liveDinConfig !== areLive, 'site/config.js are comutatorul PLATARI.LIVE (exact unul)');

const linkTest = /\/test_[A-Za-z0-9_]+$/.test(C.STRIPE.PAYMENT_LINK);
const linkLive = /\/live_[A-Za-z0-9_]+$/.test(C.STRIPE.PAYMENT_LINK);
ok(linkTest !== linkLive, 'Payment Link-ul e fie de test, fie live — niciodată amândouă');
ok(
  liveDinConfig ? linkLive : linkTest,
  'PLATARI.LIVE (' + (liveDinConfig ? 'true' : 'false') + ') corespunde cu tipul de link (' +
    (linkLive ? 'live' : 'test') + ')'
);
ok(C.LIVE_STRIPE === liveDinConfig, 'config-autoact.js citește același comutator ca textul din config');
ok(C.LINK_STRIPE_E_LIVE === liveDinConfig, 'verificaLegaturaStripe() întoarce exact starea live');

/* ---------- 2. Ghidul spune ce spun codul ---------- */
ok(contine(Ghid, String(C.PRET_RON) + ' RON'), 'ghidul folosește prețul din config (' + C.PRET_RON + ' RON)');
ok(contine(Ghid, C.STRIPE.COD_FISCAL), 'ghidul folosește codul fiscal din config (' + C.STRIPE.COD_FISCAL + ')');
ok(contine(Ghid, C.STRIPE.WEBHOOK_URL), 'ghidul folosește URL-ul de webhook din config');
ok(contine(Ghid, 'checkout.session.completed'), 'ghidul folosește evenimentul din workflow');
ok(contine(Ghid, 'STRIPE_WEBHOOK_SECRET'), 'ghidul spune unde merge semnătura webhook-ului');
ok(contine(Ghid, 'https://buy.stripe.com/live_'), 'ghidul arată forma linkului live');
ok(
  /txcd_10000000/.test(Ghid) &&
    contine(Ghid, 'Electronically Supplied Services'),
  'ghidul numește corect codul fiscal (e pe lista oficială de coduri eligibile)'
);

/* Constatarea care a schimbat planificarea: la business type, Stripe
 * România oferă doar PFA / SRL / non-profit. Dacă cineva rescrie ghidul
 * și uită asta, reapare ideea că se poate încasa fără CUI — și planificarea
 * de 200 de comenzi devine din nou greșită. */
ok(
  /PFA/.test(Ghid) && /[îi]ntreprinderea individual/i.test(Ghid) && /non_profit/.test(Ghid),
  'ghidul spune că Stripe RO cere PFA (nu există „persoană fizică neînregistrată”)'
);
ok(
  /nu se poate încasa/i.test(Ghid) && /ANAF/.test(Ghid),
  'ghidul spune că PFA-ul se ia înaintea primei plăți, la ANAF'
);

/* Documentul nu conține secrete. Motivul nu e paranoia: un signing
 * secret sau o cheie API într-un fișier versionat ajunge public la
 * primul push, iar cine îl are poate crea webhook-uri pe contul tău. */
const secrete = Ghid.match(/\b(?:whsec|sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{6,}/g);
ok(!secrete, 'ghidul nu conține nicio cheie Stripe (whsec_…/sk_…/rk_…)');
const iban = Ghid.match(/\bRO\d{2}[A-Z]{4}[A-Za-z0-9]{6,}/g);
ok(!iban, 'ghidul nu conține niciun IBAN (se introduce direct în Stripe)');
ok(
  contine(Ghid, 'IBAN-ul se introduce în Stripe') || contine(Ghid, 'IBAN-ul nu'),
  'ghidul spune explicit că IBAN-ul nu intră în repo'
);

/* ---------- 3. Webhook-ul ajunge unde poate fi ajuns ---------- */
ok(
  C.STRIPE.WEBHOOK_URL.startsWith(C.NAP.SITE + '/'),
  'URL-ul de webhook Stripe e pe domeniul site-ului (' + C.NAP.SITE + '), nu pe alt domeniu'
);
/* Linkul de plată trebuie să existe ÎN UN SINGUR LOC în proiect. Nu
 * „ workflow-ul X îl conține”: workflow-ul de plăți (module-5) nu are
 * nevoie de el, pentru că primește evenimentul de la Stripe, nu îl
 * trimite. Verificarea corectă e inversul: niciun alt link, nicăieri. */
const fisiereCuLink = [
  path.join(__dirname, '..', 'site', 'demo-standalone.html'),
  path.join(__dirname, '..', 'module-2', 'autoact-workflow.json'),
  path.join(__dirname, '..', 'module-5', 'autoact-workflow-plati.json'),
  path.join(__dirname, '..', 'site', 'config.js')
];
const linkuriGasite = new Set();
for (const f of fisiereCuLink) {
  const txt = fs.readFileSync(f, 'utf8');
  for (const m of txt.match(/https:\/\/buy\.stripe\.com\/[A-Za-z0-9_]+/g) || []) {
    linkuriGasite.add(m);
  }
}
ok(
  linkuriGasite.size <= 1,
  'în tot proiectul există cel mult un Payment Link (găsit: ' + linkuriGasite.size + ')'
);
ok(
  contine(fs.readFileSync(path.join(__dirname, '..', 'module-2', 'autoact-workflow.json'), 'utf8'),
    C.STRIPE.PAYMENT_LINK),
  'workflow-ul care trimite clientul la plată conține linkul din config'
);
const urlInWorkflow = fs.readFileSync(
  path.join(__dirname, 'autoact-workflow-plati.json'), 'utf8'
);
ok(
  contine(urlInWorkflow, C.STRIPE.WEBHOOK_URL),
  'notele de instalare din workflow dau exact URL-ul de webhook din config'
);

/* Un singur domeniu, în tot proiectul. Motivul e practic, nu estetic:
 * Caddy servește site-ul ȘI webhook-urile pe domeniul dat la deploy. Dacă
 * într-un document rămâne un subdomeniu (api.autoact.eu) și fondatorul
 * îl pune în Stripe, evenimentele ajung în gol — fără nicio eroare în
 * contul Stripe, ci doar absența documentelor.
 *
 * Verificarea privește URL-urile (cu schemă), nu orice apariție a
 * cuvântului: un document poate (și trebuie) să spună în proză că
 * subdomeniul a fost abandonat. Ce nu are voie să rămână e un URL care
 * să-l folosească — acela ar fi copiat în Stripe. */
const urlCuSubdomeniu = /https?:\/\/(?:[a-z0-9-]+\.)*api\.autoact\.eu/i;
const verificat = [
  ['site/config.js', C.CONFIG],
  ['site/README.md', path.join(__dirname, '..', 'site', 'README.md')],
  ['LAUNCH.md', path.join(__dirname, '..', 'LAUNCH.md')],
  ['BLUEPRINT.md', path.join(__dirname, '..', 'BLUEPRINT.md')],
  ['module-2/autoact-workflow.json', path.join(__dirname, '..', 'module-2', 'autoact-workflow.json')],
  ['module-5/autoact-workflow-plati.json', path.join(__dirname, 'autoact-workflow-plati.json')],
  ['ghid', path.join(__dirname, 'configurare-stripe-live.md')]
];
for (const [nume, f] of verificat) {
  const gasit = fs.readFileSync(f, 'utf8').match(urlCuSubdomeniu);
  ok(
    !gasit,
    nume + ' nu mai indică un subdomeniu pentru webhook (api.autoact.eu)' +
      (gasit ? ' — apare: ' + gasit[0] : '')
  );
}

/* ---------- 4. În test mode nu există link de plată pe pagini ---------- */
for (const f of ['index.html', 'contact.html', 'termeni.html', 'gdpr.html']) {
  const html = fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
  ok(
    liveDinConfig || !contine(html, 'buy.stripe.com'),
    'site/' + f + (liveDinConfig ? '' : ' nu conține link de plată (suntem încă în test mode)')
  );
}

/* ---------- 5. Mutații pe regula LIVE vs link ---------- */
/* Testul de mutație e singurul care spune dacă verificările 1–4 chiar
 * prind ceva: fiecare mutație ar trebui să arunce, iar starea bună să
 * treacă. */
function aruncaLa(mutatie, motiv) {
  n++;
  try {
    C.verificaLegaturaStripe(mutatie.live, mutatie.link);
    caderi++;
    console.log('FAIL mutație „' + motiv + '” a trecut — verificarea nu observă greșala');
  } catch (e) {
    if (!/test|live|link/i.test(e.message)) {
      caderi++;
      console.log('FAIL mutația „' + motiv + '” aruncă o eroare fără explicație: ' + e.message);
    } else {
      console.log('OK  mutație „' + motiv + '” e respinsă: ' + e.message.split('.')[0]);
    }
  }
}
const TEST_LINK = 'https://buy.stripe.com/test_6oU8wR7L91QodQ97ap4ZG01';
const LIVE_LINK = 'https://buy.stripe.com/live_abcdefgh';
aruncaLa({ live: true, link: TEST_LINK }, 'LIVE=true cu link de test');
aruncaLa({ live: false, link: LIVE_LINK }, 'LIVE=false cu link live');
aruncaLa({ live: 'da', link: LIVE_LINK }, 'comutatorul nu e boolean');
ok(
  C.verificaLegaturaStripe(true, LIVE_LINK) === true &&
    C.verificaLegaturaStripe(false, TEST_LINK) === false,
  'stările bune trec: true/live → true, false/test → false'
);

console.log('');
if (caderi) {
  console.log('✗ ' + caderi + ' din ' + n + ' verificări au căzut (Stripe live).');
  process.exit(1);
}
console.log('✔ ' + n + ' verificări — ghidul Stripe, configul și workflow-urile spun același lucru.');
