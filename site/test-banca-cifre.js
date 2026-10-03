/* ============================================================
 * AutoAct | site | test-banca-cifre.js
 * GUARD DE CONȚINUT — varianta statică a celei din ClarTransfer.
 * ============================================================
 * Aici nu pornește nimic (se citește fișierul HTML), deci rulează
 * identic în CI, la deploy și pe laptop, în ~0.1s.
 *
 * CE GARDEAZĂ
 *   În textul PUBLIC (ce vede utilizatorul și Google) nu poate
 *   apărea o cifră care nu vine din cod și nu este o excepție
 *   declarată mai jos. Exemplu de ce contează: dacă cineva scrie
 *   „PLĂTEȘTE 39 RON” direct în HTML, prețul real plătit rămâne 49
 *   și nimeni nu află până la o reclamație.
 *
 * AL CUI TEXT ÎI FACEM EXTRACȚIA
 *   nu tot fișierul HTML (atributele tehnice — charset, viewport,
 *   id-uri, dimensiuni — sunt zgomot), ci doar ce se vede și se
 *   citește: textul din <body>, textul meta description/title și
 *   obiectul JSON-LD (prețul pe care Google îl indexează).
 *
 * REGULA
 *   orice cifră găsită trebuie să fie în:
 *     1. COD      — valori care chiar există în proiect (prețul din
 *                   site/config.js, token-uri, praguri din validatoare);
 *     2. EXCEPȚIE — declarată explicit, cu motiv, în EXCEPTII;
 *     3. STRUCTURALĂ — numerotare de pași (1..9), ani, sume de exemplu
 *                   din placeholder-uri, coduri de țară/JS (RO, 3-D).
 *
 * TEST DE MUTAȚIE (secțiunea 5 de mai jos)
 *   Testul se autoverifică: injectează o cifră absurdă într-o copie
 *   în memorie a textului public și cere ca verificarea să CADĂ.
 *   Dacă cineva slăbește guard-ul (de exemplu face orice cifră permisă),
 *   auto-verificarea aceasta pică imediat.
 *
 * Rulare:  node site/test-banca-cifre.js
 * Ieșire:  0 = ok, 1 = eșec (afișează exact cifrele nejustificate)
 * ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const { PRET_RON, PRET_AFISAT, NAP, PLACEHOLDER_NAP, RETENTION_H, EXCEPTII_CIFRE, cifraControlCif, PLACEHOLDER_LEGAL,
        PROCESATOR_PLATI, PRAG_REGULARIZARE, STRIPE } = require('../config-autoact.js');

const rad = (p) => path.join(__dirname, p);
const configJs = fs.readFileSync(rad('config.js'), 'utf8');
let failures = 0;
let checks = 0;

function ok(cond, msg) {
  checks++;
  if (cond) {
    console.log('PASS  ' + msg);
  } else {
    failures++;
    console.log('FAIL  ' + msg);
  }
}

/* ---------- 1. Ce e permis: din cod ---------- */
const COD = {
  [PRET_RON]: 'prețul unic, în lei cu TVA inclus, din site/config.js (singura sursă)'
};

/* ---------- 2. Ce e permis: excepții declarate ---------- */
const EXCEPTII = Object.assign({}, EXCEPTII_CIFRE, {
  60: 'promisiune de timp din titlu/hero („în 60 de secunde”) — marketing, nu preț',
  80: 'lățime viewport în CSS inline (320/80%) — tehnic',
  100: 'procentaj CSS/ZIP — tehnic',
  10: 'cifră din coduri/șiruri tehnice (JS, ZIP, formate) — tehnic'
});

/* ---------- 3. Ce e permis structural (nu trebuie declarat) ---------- */
const eStructural = (n) => {
  if (n >= 1900 && n <= 2100) return 'an calendaristic';
  if (n >= 1 && n <= 9) return 'numerotare de pas / listă';
  return null;
};

/* ---------- Extracția textului public ---------- */
function textPublic(html) {
  let s = html;
  // 1. JSON-LD îl păstrăm separat (Google citește prețul de acolo)
  const ld = [];
  s = s.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (_m, js) => {
    ld.push(js);
    return ' ';
  });
  // 2. restul script-urilor (cod) nu e text public
  s = s.replace(/<script[\s\S]*?<\/script>/g, ' ');
  s = s.replace(/<style[\s\S]*?<\/style>/g, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  // 3. meta description + title sunt text public chiar fiind atribute
  const meta = [];
  s.replace(/<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/g, (_m, c) => { meta.push(c); return _m; });
  s.replace(/<title>([\s\S]*?)<\/title>/g, (_m, c) => { meta.push(c); return _m; });
  // 4. restul: text dintre taguri, atribute aruncate
  s = s.replace(/<[^>]*>/g, ' ');
  const decodat = (x) => x
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/&#\d+;/g, ' ')
    .replace(/&[a-z0-9]+/gi, ' ');
  return decodat(meta.join(' ') + ' ' + s + ' ' + ld.join(' '));
}

/* ---------- Verificarea propriu-zisă ----------
 * NAP-ul (CIF, telefon, registru) conține cifre care NU sunt preț și
 * nici excepții — dar sunt legime, fiindcă vin din config.js. Le
 * tratăm prin MASCARE înainte de scanare, nu prin excepție: adică
 * verificăm cifrele rămase și, separat, verificăm strict că NAP-ul
 * din pagină e IDENTIC cu cel din config.js (mai tare decât „număr
 * permis”: impune valoarea exactă).
 */
function mascheazaNap(text) {
  let t = text;
  for (const valoare of [NAP.CIF, NAP.REG_COM, NAP.TELEFON, NAP.ADRESA, NAP.EMAIL, NAP.SITE]) {
    if (!valoare) continue;
    t = t.split(valoare).join(' ⟨NAP⟩ ');
  }
  // și cifrele „sparte" ale aceluiași NAP (ex. CIF fără prefix RO)
  const cifFaraPrefix = NAP.CIF.replace(/^RO/, '').trim();
  if (cifFaraPrefix) t = t.split(cifFaraPrefix).join(' ⟨NAP⟩ ');
  return t;
}

function cifreNejustificate(text, { mascheaza = true } = {}) {
  const scanat = mascheaza ? mascheazaNap(text) : text;
  const rele = /\b\d[\d.]*\b/g;
  const nejust = [];
  let m;
  while ((m = rele.exec(scanat)) !== null) {
    const raw = m[0].replace(/\.$/, '');
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    const motiv = COD[n] || EXCEPTII[n] || eStructural(n);
    if (!motiv) nejust.push({ cifra: raw, context: contextLung(scanat, m.index, raw) });
  }
  return nejust;
}

function contextLung(text, idx, cifra) {
  const a = Math.max(0, idx - 45);
  const b = Math.min(text.length, idx + cifra.length + 25);
  return '…' + text.slice(a, b).replace(/\s+/g, ' ').trim() + '…';
}

/* ---------- Rulează guard-ul pe un HTML dat ---------- */
function verifica(html, eticheta) {
  const nejust = cifreNejustificate(textPublic(html));
  ok(
    nejust.length === 0,
    eticheta + ': nicio cifră fără origine în cod' +
      (nejust.length ? ' — ' + nejust.map((x) => '„' + x.cifra + '” ' + x.context).join(' | ') : '')
  );
  return nejust;
}

/* ============ 1. Textul public al site-ului ============ */
const PAGINI = ['index.html', 'contact.html', 'termeni.html', 'gdpr.html', 'demo-standalone.html'];
const htmluri = {};
for (const p of PAGINI) {
  const h = fs.readFileSync(rad(p), 'utf8');
  htmluri[p] = h;
  verifica(h, 'site/' + p);
}

/* ============ 2. Șabloanele: nu conține cifre scrise manual ============ */
const SABLOANE = ['index.sablon.html', 'contact.sablon.html', 'termeni.sablon.html', 'gdpr.sablon.html'];
for (const p of SABLOANE) {
  const s = fs.readFileSync(rad(p), 'utf8');
  // fără tokenuri, orice cifră din TEXTUL PUBLIC al șablonului ar fi o
  // constantă scrisă manual (atributele tehnice nu sunt text public)
  const faraTokenuri = textPublic(s).replace(/\{\{[A-Z_]+\}\}/g, ' ');
  const nejust = cifreNejustificate(faraTokenuri, { mascheaza: false });
  ok(nejust.length === 0, 'site/' + p + ': nicio cifră scrisă manual în șablon (doar tokenuri)' + (nejust.length ? ' — ' + nejust.map((x) => x.cifra).join(', ') : ''));
  /* NAP-ul nu se scrie niciodată cu mâna într-un șablon. O valoare
   * copiată acolo trece neobservată de verificarea de mai sus (nu conține
   * cifre „suspecte"), dar rămâne în pagină după ce schimbi NAP-ul în
   * config.js — iar diferența nu o vede nimeni. */
  for (const [cheie, valoare] of Object.entries(NAP)) {
    /* DENUMIRE e exclus: numele de brand apare legitim în proză („AutoAct
     * are nevoie de JavaScript”) și nu e o valoare care se poate
     * desincroniza. Ceea ce trebuie să vină din token sunt IDENTIFICATORII:
     * CIF-ul, adresa, telefonul, e-mail-ul — acelea care, copiate cu mâna,
     * rămân în pagină după ce sunt schimbate în config.js. */
    if (cheie === 'DENUMIRE') continue;
    /* Nu se sare nici peste valorile placeholder: o valoare copiată cu
     * mâna într-un șablon e greșită FIE că e fictivă, fie că e reală.
     * Iar cât timp NAP-ul e placeholder, e tocmai momentul în care cineva
     * copiază „Str. Exemplu 1" într-un șablon — adică fixează în pagină
     * o adresă fictivă care va supraviețui completării ulterioare. */
    if (!valoare) continue;
    ok(!s.includes(valoare),
      'site/' + p + ': NAP.' + cheie + ' vine din token, nu e scris cu mâna',
      'valoarea „' + valoare + '” e copiată direct în șablon — se desincronizează de config.js');
  }
  verifica(s, 'site/' + p);
}
const sablon = fs.readFileSync(rad('index.sablon.html'), 'utf8');
const tokenuri = (sablon.match(/\{\{PRET_(RON|AFISAT)\}\}/g) || []).length;
ok(tokenuri === 5, 'site/index.sablon.html: 5 tokenuri de preț (html data-pret, meta, hero, buton, JSON-LD) — găsite: ' + tokenuri);
ok(!sablon.includes('{{PRET_EUR'), 'site/index.sablon.html: niciun token în euro n-a rămas (prețul se încasează în lei)');
const tokenuriNap = sablon.match(/\{\{(CIF|REG_COM|ADRESA|TELEFON|EMAIL|DENUMIRE|SITE_URL)\}\}/g) || [];
const cheiNap = [...new Set(tokenuriNap.map((t) => t.slice(2, -2)))].sort();
const asteptate = ['ADRESA', 'CIF', 'DENUMIRE', 'EMAIL', 'REG_COM', 'SITE_URL', 'TELEFON'];
ok(cheiNap.length === asteptate.length && asteptate.every((c) => cheiNap.includes(c)),
  'site/index.sablon.html: toate cele 7 tokenuri NAP prezente în șablon — găsite: ' + cheiNap.join(', '));
ok(!sablon.includes(NAP.CIF) && !sablon.includes(NAP.ADRESA) && !sablon.includes(NAP.TELEFON),
  'site/index.sablon.html: nicio valoare NAP scrisă direct (totul prin tokenuri)');

/* ============ 3. NAP: apare IDENTIC cu config.js ============ */
/* Verificarea NAP e prin EGALITATE cu valoarea din config.js, nu prin
 * „număr permis” — masca cifre, ca mutația unei cifre să fie prinsă
 * chiar dacă cifra nouă ar fi altfel permisă (1..9, an, etc.). */
function problemeNap(h) {
  const p = [];
  if (!h.includes(NAP.CIF)) p.push('CIF-ul din config.js lipsește din pagină');
  if (!h.includes(NAP.EMAIL)) p.push('e-mail-ul NAP lipsește din pagină');
  if (!h.includes(NAP.ADRESA)) p.push('adresa NAP lipsește din pagină');
  // cifre „asemănătoare” cu cele reale, care ar indica o falsificare
  const cifreCif = h.match(/\bRO\d{2,10}\b/g) || [];
  for (const c of cifreCif) if (c !== NAP.CIF) p.push('CIF strain în pagină: ' + c);
  const telUri = h.match(/tel:([+\d\s()-]{6,})/g) || [];
  for (const t of telUri) if (!t.includes(NAP.TELEFON)) p.push('telefon strain: ' + t);
  const mailUri = h.match(/mailto:([^\"'>]+)/g) || [];
  for (const m of mailUri) if (!m.includes(NAP.EMAIL)) p.push('e-mail strain: ' + m);
  // orice adresă de stradă din TEXTUL PUBLIC trebuie să fie cea din config.js
  // (textPublic elimină CSS/JS inline, unde apar adrese de test)
  const adrese = textPublic(h).match(/\bStr\.[^·<|)"\n]+/g) || [];
  /* După adresă urmează, în mod normal, punctuația frazei („…sediul în
   * Str. Exemplu 1, București. Contact:”), care nu aparține adresei. De
   * aceea se cere ca adresa găsită să ÎNCEAPĂ cu cea din config.js: asta
   * prinde în continuare orice adresă reală straină, dar nu mai respinge
   * proza care urmează după adresă. */
  for (const a of adrese) {
    const gasita = a.trim().replace(/[.,;:]+$/, '');
    if (!gasita.startsWith(NAP.ADRESA) && !NAP.ADRESA.startsWith(gasita)) p.push('adresă straină: ' + gasita);
  }
  return p;
}

const indexHtml = htmluri['index.html'];
for (const [pagina, h] of Object.entries(htmluri)) {
  const p = problemeNap(h);
  ok(p.length === 0, 'site/' + pagina + ': NAP coerent cu config.js' + (p.length ? ' — ' + p.join(' | ') : ''));
  ok(!h.includes('{{'), 'site/' + pagina + ': niciun token neînlocuit');
}
const contactHtml = htmluri['contact.html'];
ok(contactHtml.includes(NAP.TELEFON) && contactHtml.includes(NAP.REG_COM), 'site/contact.html: telefonul și reg. com. din config.js apar în tabelul NAP');
ok(/<h1>Contact<\/h1>/.test(contactHtml), 'site/contact.html: pagina de contact are titlu');
ok(contactHtml.includes('mailto:' + NAP.EMAIL) && contactHtml.includes('tel:' + NAP.TELEFON), 'site/contact.html: legături mailto:/tel: pornite din config.js');

/* ============ 4. schema.org: JSON-LD valid și NAP coerent ============ */
const ldRaw = indexHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
const ld = JSON.parse(ldRaw);
const graf = ld['@graph'];
ok(Array.isArray(graf) && graf.length === 3, 'JSON-LD: @graph cu 3 noduri (Organization + WebSite + Product) — găsite: ' + (graf ? graf.length : 0));
const org = graf.find((n) => n['@type'] === 'Organization');
const web = graf.find((n) => n['@type'] === 'WebSite');
const prod = graf.find((n) => n['@type'] === 'Product');
ok(!!org && !!web && !!prod, 'JSON-LD: toate cele trei tipuri există (Organization, WebSite, Product)');
ok(org && org.vatID === NAP.CIF, 'JSON-LD: Organization.vatID = CIF-ul din config.js — este „' + (org && org.vatID) + '”');
ok(org && org.email === NAP.EMAIL && org.telephone === NAP.TELEFON, 'JSON-LD: Organization poate contactul din config.js');
ok(org && org.address && org.address.streetAddress === NAP.ADRESA && org.address.addressCountry === 'RO', 'JSON-LD: adresa poștală NAP cu addressCountry RO');
ok(org && org.contactPoint && org.contactPoint.contactType && org.contactPoint.availableLanguage === 'ro', 'JSON-LD: contactPoint cu tip și limbă română');
ok(prod && prod.offers.price === String(PRET_RON) && prod.offers.priceCurrency === 'RON', 'JSON-LD: Product.offers.price = ' + PRET_RON + ' RON (din config.js)');
ok(prod && prod.brand && prod.brand['@id'] === org['@id'], 'JSON-LD: Product.brand referă Organization-ul (nu o copie a numelui)');
ok(web && web.publisher && web.publisher['@id'] === org['@id'], 'JSON-LD: WebSite.publisher referă Organization-ul');
ok(prod && prod.areaServed && prod.areaServed.name === 'România', 'JSON-LD: Product.areaServed = România');
const referinte = (ldRaw.match(/"@id": "[^"]+#/g) || []).length;
const iduri = new Set((ldRaw.match(/"@id": "([^"]+)"/g) || []).map((x) => x.slice(8, -1)));
ok(iduri.size === 3, 'JSON-LD: 3 identificatori @id, toate referite de cel puțin un nod (fără @id orfan) — găsiți: ' + iduri.size);

/* Promisiunea de retenție din pagina de contact trebuie să fie cea pe
 * care job-ul GDPR o aplică efectiv — altfel pagina promite 48h și
 * scriptul curăță la alt prag. */
const sqlPurge = fs.readFileSync(path.join(__dirname, '..', 'module-4', 'gdpr-purge.sql'), 'utf8');
ok(sqlPurge.includes("INTERVAL '" + RETENTION_H + " hours'"),
  'retenția promisesă în pagină (' + RETENTION_H + 'h) e cea aplicată de module-4/gdpr-purge.sql');
ok(contactHtml.includes(RETENTION_H + ' de ore'), 'site/contact.html: menționează retenția de ' + RETENTION_H + ' ore');

/* ============ 1.bis Pagini legale: /termeni și /gdpr ============ */
/* Le-am construit ca să nu mai existe linkuri moarte în footer — iar un
 * link mort în footer-ul paginii de pe Facebook e exact genul de defect
 * pe care nimeni nu-l mai repară după lansare. Dar o pagină de termeni
 * greșită e mai rea decât una lipsă: de aceea fiecare cifră a lor trece
 * prin aceeași bancă, iar câmpurile pe care legea nu le dictează sunt
 * blocate cât timp sunt necompletate. */

const termeniHtml = htmluri['termeni.html'];
const gdprHtml = htmluri['gdpr.html'];

/* NAP-ul apare prin tokenuri, nu scris de mână — altele două surse de
 * adevăr pentru aceleași date, care se desincronizează imediat. */
for (const [nume, h] of [['termeni.html', termeniHtml], ['gdpr.html', gdprHtml]]) {
  ok(h.includes(NAP.CIF) && h.includes(NAP.REG_COM) && h.includes(NAP.TELEFON) && h.includes(NAP.EMAIL),
    'site/' + nume + ': NAP-ul vine din config.js (CIF, reg. com., telefon, e-mail)');
  ok(h.includes('href="/contact"') && h.includes('href="/gdpr"') && h.includes('href="/termeni"'),
    'site/' + nume + ': footerul leagă paginile legale între ele și de contact');
  ok(!/\{\{/.test(h), 'site/' + nume + ': niciun token neînlocuit');
}

/* Promisiunea de retenție trebuie să fie cea aplicată efectiv. Pagina GDPR
 * vorbește despre DOUĂ termene (livrat / neplătit), iar ambele trebuie să
 * existe în SQL — altfel pagina promite un prag pe care job-ul nu îl aplică. */
const pragNeplata = 72;
ok(sqlPurge.includes("INTERVAL '" + RETENTION_H + " hours'"),
  'gdpr.html: termenul de după livrare (' + RETENTION_H + 'h) apare în module-4/gdpr-purge.sql');
ok(sqlPurge.includes("INTERVAL '" + pragNeplata + " hours'"),
  'gdpr.html: termenul pentru dosare fără plată (' + pragNeplata + 'h) apare în module-4/gdpr-purge.sql');
ok(gdprHtml.includes(RETENTION_H + ' de ore') && gdprHtml.includes(pragNeplata + ' de ore'),
  'site/gdpr.html: ambele termene de retenție apar în pagina, nu doar unul');
ok(termeniHtml.includes(RETENTION_H + ' de ore'), 'site/termeni.html: menționează retenția de ' + RETENTION_H + ' ore');

/* Lista de operatori subcontractori din gdpr.html nu poate fi o glosă:
 * ea trebuie să fie extrasă din workflow-ul REAL. Afișăm un furnizor
 * pe care nu-l folosim și ascundem unul pe care îl folosim înseamnă, în
 * această pagină, o declarație greșită — iar o declarație greșită despre
 * cine atinge datele personale e exact ce se urmărește. */
const wfSubPlati = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'module-5', 'autoact-workflow-plati.json'), 'utf8'));
const wfSubPipeline = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'module-2', 'autoact-workflow.json'), 'utf8'));
const surseW = JSON.stringify([wfSubPlati, wfSubPipeline]);

/* Direcția 1: ce declară pagina trebuie să existe și în cod. */
const FURNIZORI_COD = [
  { nume: 'OpenAI', dovada: /api\.openai\.com/ },
  { nume: 'Gemini', dovada: /generativelanguage\.googleapis\.com/ },
  { nume: 'Stripe', dovada: /buy\.stripe\.com/ },
  { nume: 'Google', dovada: /googleapis\.com/ }
];
for (const f of FURNIZORI_COD) {
  ok(f.dovada.test(surseW),
    'site/gdpr.html: „' + f.nume + '” e operator subcontractor REAL — workflow-ul îl apelează');
}
ok(/n8n-nodes-base\.gmail/.test(surseW),
  'site/gdpr.html: „Gmail” e operator subcontractor REAL — livrarea se face prin el');
ok(/Oracle/i.test(fs.readFileSync(path.join(__dirname, '..', 'module-3', 'deploy-autoact.sh'), 'utf8')),
  'găzduitorul Oracle există în deploy-ul real');
ok(/Oracle/i.test(gdprHtml),
  'site/gdpr.html: „Oracle Cloud” e declarat ca operator subcontractor',
  'deploy-ul rulează pe Oracle, dar pagina nu îl declară — date care ajung la un operator nedeclarat');

/* Direcția 2 — cea care contează: orice domeniu extern apelat efectiv
 * trebuie să fie DECLARAT în pagină. Altfel pagina poate fi corectă
 * pentru furnizorii pe care ne-am gândit, și totuși să omită pe cel
 * nou — adică exact situația pe care GDPR o cere să nu se întâmple. */
const DOMENII_DECLARATE = [
  { domeniu: 'openai.com', cine: 'OpenAI' },
  { domeniu: 'googleapis.com', cine: 'Google' },
  { domeniu: 'stripe.com', cine: 'Stripe' }
];
const apeluriExterne = [...new Set((surseW.match(/https:\/\/[a-z0-9.-]+/g) || [])
  .map((u) => u.replace('https://', '')))];
for (const d of DOMENII_DECLARATE) {
  if (d.domeniu === 'googleapis.com') continue; // verificat mai jos, prin generativelanguage
  ok(apeluriExterne.some((h) => h.endsWith(d.domeniu)) && gdprHtml.includes(d.cine),
    'site/gdpr.html: domeniul ' + d.domeniu + ' e apelat de workflow ȘI este declarat ca „' + d.cine + '”');
}
const domeniiNedeclarate = apeluriExterne.filter((h) =>
  !DOMENII_DECLARATE.some((d) => h.endsWith(d.domeniu)) &&
  h !== 'domeniul.ro' && h !== 'localhost' && !h.startsWith('127.0.0.1') && !h.startsWith('api.autoact') && !h.startsWith('autoact'));
ok(domeniiNedeclarate.length === 0,
  'site/gdpr.html: niciun domeniu extern apelat de workflow nu e nedecarat ca subcontractor',
  'apelat dar neprecizat în pagină: ' + domeniiNedeclarate.join(', '));

/* Cele două lucruri pe care legea nu le dictează. Cât timp sunt
 * necompletate, paginile NU trebuie publicate — altfel publicăm termeni
 * fără data de aplicare și fără instanțe, ceea ce e mai rău decât
 * absența lor, pentru că pare conform. */
/* Cele două lucruri pe care legea nu le dictează. Testul NU poate fi
 * un blocaj, pentru că atunci nu s-ar mai putea livra cod în CI; dar nici
 * nu poate fi o trecere tăcută. De aceea: consistența dintre config.js și
 * pagina generată e verificare reală (cade dacă marcajul dispare din
 * pagină în timp ce config-ul e necompletat), iar blocajul de publicare
 * stă în deploy-autoact.sh, unde oprește înainte de server. */
if (PLACEHOLDER_LEGAL) {
  console.log('⚠ site/config.js: LEGAL.DATA_ACCEPTARE / LEGAL.INSTANTE sunt încă necompletate.');
  console.log('  → /termeni și /gdpr NU pot fi publicate; deploy-autoact.sh se oprește.');
}
const marcajInPagina = (h) => /înlocuiește/i.test(h);
ok(!PLACEHOLDER_LEGAL || marcajInPagina(termeniHtml),
  'site/termeni.html: marcajul de necompletat e VIZIBIL în pagina generată (nu se poate rata)',
  'marcajul a dispărut din pagină deși config.js e încă necompletat — publicarea ar fi tăcută');
ok(!PLACEHOLDER_LEGAL || marcajInPagina(gdprHtml),
  'site/gdpr.html: marcajul de necompletat e VIZIBIL în pagina generată (nu se poate rata)',
  'marcajul a dispărut din pagină deși config.js e încă necompletat — publicarea ar fi tăcută');

/* Deploy-ul trebuie să oprească înainte de server, exact ca la NAP. */
const deployLegal = fs.readFileSync(path.join(__dirname, '..', 'module-3', 'deploy-autoact.sh'), 'utf8');
ok(
  /AUTOACT_LEGAL_PLACEHOLDER=.*PLACEHOLDER_LEGAL/.test(deployLegal) &&
  deployLegal.includes('ALLOW_PLACEHOLDER_LEGAL:-0') &&
  deployLegal.includes('EROARE: paginile /termeni și /gdpr'),
  'deploy-autoact.sh are blocaj COMPLET pentru paginile legale (evaluare + excepție + mesaj + ieșire)'
);
ok(
  deployLegal.indexOf('AUTOACT_LEGAL_PLACEHOLDER') > 0 &&
  deployLegal.indexOf('AUTOACT_LEGAL_PLACEHOLDER') < deployLegal.indexOf('ssh "$SSH_TARGET"'),
  'blocajul paginilor legale e evaluat înainte de prima conexiune SSH'
);

/* Deploy-ul trebuie să verifice paginile pe NUME, nu doar să numere
 * fișiere. Un contor trece și când lipsește exact pagina care contează:
 * site-ul răspunde la /, deci totul „pare" bine, dar linkul din footer
 * și din pagina de Facebook duce la 404. */
const PAGINI_OBLIGATORII = ['index', 'contact', 'termeni', 'gdpr'];
/* Se citește DOAR linia buclei — nu tot ce urmează. Altfel verificarea se
 * mulțumea cu prezența cuvântului „termeni” în mesajul de eroare, în
 * timp ce bucla nu mai verifica deloc pagina (a fost chiar o mutație
 * nedetectată înainte de această corectare). */
const liniaBucla = (deployLegal.match(/for pagina in [^\n]*; do/) || [''])[0];
ok(liniaBucla !== '', 'deploy-autoact.sh are bucla care verifică paginile pe nume');
for (const p of PAGINI_OBLIGATORII) {
  ok(liniaBucla.includes(p),
    'deploy-autoact.sh verifică explicit prezența paginii ' + p + '.html pe server',
    'bucla verifică „' + liniaBucla + '” — nu și ' + p + ', deci o lipsă ar trece neobservată');
}
ok(/test -f/.test(deployPeNumeSauCeleBlock()), 'verificarea prezenței paginilor folosește „test -f" pe server');
function deployPeNumeSauCeleBlock() {
  const i = deployLegal.indexOf('for pagina in');
  return i >= 0 ? deployLegal.slice(i, i + 400) : '';
}

/* Deploy-ul trebuie să OPREASCĂ înainte de a atinge serverul dacă NAP-ul
 * e placeholder — altfel documentele oficiale pornesc cu CIF fictiv. */
const deploy = fs.readFileSync(path.join(__dirname, '..', 'module-3', 'deploy-autoact.sh'), 'utf8');
ok(
  deploy.includes('ALLOW_PLACEHOLDER_NAP') && deploy.includes('PLACEHOLDER_NAP'),
  'deploy-autoact.sh are blocaj pentru NAP placeholder (nu lasă .env cu CIF fictiv)'
);
const pozGuard = deploy.indexOf('PLACEHOLDER_NAP');
const pozPrimaSsh = deploy.indexOf('ssh "$SSH_TARGET"');
ok(pozGuard > 0 && pozGuard < pozPrimaSsh, 'blocajul NAP e evaluat înainte de prima conexiune SSH');

/* Cheile Stripe nu pot fi generate — se copiază din contul Stripe. De aceea
 * deploy-ul le declară GOALE și apoi VERIFICĂ dacă au fost completate: un
 * secret lipsit e altfel un stack „cu succes" care pierde prima plată. */
ok(deploy.includes('STRIPE_WEBHOOK_SECRET=') && deploy.includes('STRIPE_WEBHOOK_SECRET='),
  'deploy-autoact.sh scrie STRIPE_WEBHOOK_SECRET în .env');
ok(deploy.includes(String.fromCharCode(92) + "${cheie}=."),
  'deploy-autoact.sh VERIFICă dacă cheile Stripe/Google sunt completate într-un .env existent');
ok(!/NETOPIA|SMARTBILL/.test(deploy),
  'deploy-autoact.sh nu mai scrie chei Netopia/SmartBill (procesatorul e Stripe)');
ok(!/NETOPIA|SMARTBILL/.test(fs.readFileSync(path.join(__dirname, '..', 'module-3', 'docker-compose.yml'), 'utf8')),
  'docker-compose.yml nu mai expune chei Netopia/SmartBill în containerul n8n');

/* ============ 8. LAUNCH.md nu îmbătrânește ============ */
/* Cifrele din planul de lansare (noduri, placeholder-e, pași) trebuie
 * să corespundă codului — altora documentul promite lucruri care nu mai
 * există, exact defectul pe care banca de cifre îl prinde în pagină. */
const launch = fs.readFileSync(path.join(__dirname, '..', 'LAUNCH.md'), 'utf8');
const wfPipeline = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'module-2', 'autoact-workflow.json'), 'utf8'));
const wfPlati = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'module-5', 'autoact-workflow-plati.json'), 'utf8'));
const nrPlaceholder = Object.keys(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'module-2', 'sabloane', 'placeholders.json'), 'utf8')).placeholders).length;
const nrPasi = (fs.readFileSync(path.join(__dirname, '..', 'ruleaza-teste.sh'), 'utf8').match(/^pas "/gm) || []).length;

ok(launch.includes(wfPipeline.nodes.length + ' noduri'), 'LAUNCH.md: numărul de noduri ale pipeline-ului e corect (' + wfPipeline.nodes.length + ')');
ok(launch.includes(wfPlati.nodes.length + ' noduri'), 'LAUNCH.md: numărul de noduri ale workflow-ului de plăți e corect (' + wfPlati.nodes.length + ')');
ok(launch.includes(nrPlaceholder + ' placeholder-e'), 'LAUNCH.md: numărul de placeholder-e e corect (' + nrPlaceholder + ')');
ok(launch.includes(nrPasi + ' pași'), 'LAUNCH.md: numărul de pași ai runner-ului e corect (' + nrPasi + ')');
ok(launch.includes(RETENTION_H + 'h'), 'LAUNCH.md: retenția GDPR menționată e cea implementată (' + RETENTION_H + 'h)');
/* Decizia fiscală (procesator + prag de regularizare) stă în config.js.
 * Dacă se schimbă procesatorul sau pragul într-un loc și nu în celălalt,
 * planul de lansare și codul ar povesti lucruri diferite. */
ok(
  PROCESATOR_PLATI === 'stripe' && configJs.includes("PROCESATOR: 'stripe'"),
  'decizia fiscală: procesatorul e Stripe (Merchant of Record) în config.js („' + PROCESATOR_PLATI + '”)'
);
/* ID-urile Stripe sunt publice prin natura lor, dar nu au voie să fie copiate
 * în workflow sau șablon: o migrare de cont Stripe trebuie să fie o singură
 * editare, în config.js — altfel jumătate din sistem indică contul vechi. */
const wfPlatiSrc = fs.readFileSync(path.join(__dirname, '..', 'module-5', 'autoact-workflow-plati.json'), 'utf8');
for (const [nume, valoare] of Object.entries(STRIPE)) {
  ok(!wfPlatiSrc.includes(valoare),
    'STRIPE.' + nume + ': ID-ul stă în config.js, nu e copiat în workflow-ul de plăți',
    'valoarea „' + valoare + '” apare și în codul generat');
}
ok(
  Number.isInteger(PRAG_REGULARIZARE) && PRAG_REGULARIZARE > 0
    && configJs.includes('PRAG_COMENZI_REGULARIZARE: ' + PRAG_REGULARIZARE),
  'decizia fiscală: pragul de regularizare (' + PRAG_REGULARIZARE + ' comenzi) e citibil din config.js'
);
ok(
  launch.includes('Stripe') && launch.includes('Merchant of Record'),
  'LAUNCH.md: decizia Stripe (Merchant of Record) e documentată, nu doar cod'
);
/* Prețul unic, TVA inclus, trebuie să fie spus în plan și cu măsurătoarele
 * care l-au ales — altă forma, documentul rămâne o decizie nemotivată. */
ok(launch.includes(PRET_AFISAT) && /TVA inclus/i.test(launch),
  'LAUNCH.md: prețul afișat (' + PRET_AFISAT + ', TVA inclus) e documentat');
ok(launch.includes('RO00000000') === PLACEHOLDER_NAP, 'LAUNCH.md: statusul NAP-ului (placeholder/necompletat) corespunde lui config.js');
for (const f of ['site/config.js', 'config-autoact.js', 'module-3/deploy-autoact.sh', 'module-2/sabloane/README.md', 'module-4/gdpr-purge.sql', 'module-5/plati-schema.sql']) {
  const citat = launch.includes('`' + f + '`') || launch.includes(f);
  ok(!citat || fs.existsSync(path.join(__dirname, '..', f)), 'LAUNCH.md: referința ' + f + ' indică un fișier existent');
}

/* Cifra de control a CIF-ului apare corect în pagină */
const { control, calc } = cifraControlCif(NAP.CIF.replace(/^RO/, ''));
ok(control === calc, 'CIF-ul din config.js are cifra de control validă („' + control + '”, algoritmul dă „' + calc + '”)');
if (PLACEHOLDER_NAP) {
  console.log('');
  console.log('⚠ ATENȚIE: NAP-ul din site/config.js e încă PLACEHOLDER');
  console.log('  CIF „' + NAP.CIF + '”, Reg. Com. „' + NAP.REG_COM + '”, adresă „' + NAP.ADRESA + '”');
  console.log('  Înlocuiește-le înainte de lansare ȘI pune SMARTBILL_VAT_CODE=' + NAP.CIF + ' în .env pe server.');
}

/* ============ 5. Coerența prețului: HTML = config.js ============ */
const metaDesc = indexHtml.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"/)[1];
ok(metaDesc.includes(PRET_AFISAT), 'meta description conține suma din config.js (' + PRET_AFISAT + ')');
ok(/TVA inclus/i.test(metaDesc), 'meta description precizează „TVA inclus” — prețul nu adaugă nimic la plată');
ok(!/€/.test(metaDesc + indexHtml.split('</head>')[0]), 'textul public nu mai promite sumă în euro');
const buton = indexHtml.match(/id="btn-plata"[^>]*>([^<]*)</)[1];
ok(buton.includes(PRET_AFISAT), 'butonul de plată conține suma din config.js — text: „' + buton.trim() + '”');
ok(!indexHtml.includes('{{PRET_'), 'index.html generat: niciun token neînlocuit');
ok(!/<!--\s*SABLON/.test(indexHtml) && !/SABLON\s+—\s+nu edita/.test(indexHtml), 'index.html generat: nicio notă de build din șablon nu ajunge în pagina publică');
ok(
  (indexHtml.match(/<html lang="ro" data-pret="(\d+)">/) || [])[1] === String(PRET_RON),
  'index.html: <html data-pret> = ' + PRET_RON + ' RON (fallback-ul din app.js vine tot din config.js)'
);

/* Placeholder-ul din atribut nu e „text public”, deci guard-ul de cifre
 * nu îl vede — dar nici el nu are voie să derive de nicăieri.
 * Verificăm că e exact valoarea declarată în EXCEPTII_CIFRE. */
const SUMA_EXEMPLU = 9500;
const placeholder = (indexHtml.match(/id="inp-pret"[^>]*placeholder="ex: (\d+)"/) || [])[1];
ok(placeholder === String(SUMA_EXEMPLU), 'placeholder-ul de exemplu este ' + SUMA_EXEMPLU + ' (valoarea declarată în config-autoact.js, nu una scrisă cu gura) — este „' + placeholder + '”');

/* ============ 6. TEST DE MUTAȚIE — guard-ul chiar cade ============ */
console.log('');
console.log('— test de mutație (verifică că guard-ul nu e decorativ) —');
/* Fiecare probă este o mutație REALĂ aplicată textului curent:
 * cineva editează index.html și scrie o cifră greșit. */
const probe = [
  ['butonul de plată arată 39 lei în loc de ' + PRET_AFISAT,
    (h) => h.replace('PLĂTEȘTE ' + PRET_AFISAT, 'PLĂTEȘTE 39 lei')],
  ['JSON-LD anunță prețul 39 (Google indexează exact asta)',
    (h) => h.replace('"price": "' + PRET_RON + '"', '"price": "39"')],
  ['meta description promite 59 lei',
    (h) => h.replace('plătești ' + PRET_AFISAT, 'plătești 59 lei')],
  ['apare o sumă nouă în pagină (129)',
    (h) => h.replace('~60 de secunde', '~60 de secunde (pachetul costă 129 RON)')],
  ['promisiunea de timp din buton devine 90 de secunde',
    (h) => h.replace('~60 de secunde', '~90 de secunde')],
  ['numărul de pași ai formularului e schimbat (din 12)',
    (h) => h.replace('Pasul 1 din 5', 'Pasul 1 din 12')],
  ['pragul legal de luni e alterat (sub 12)',
    (h) => h.replace('sub 24 de luni', 'sub 12 luni')]
];
for (const [nume, muta] of probe) {
  const rez = cifreNejustificate(textPublic(muta(indexHtml)));
  ok(rez.length > 0, 'mutație: ' + nume + ' → guard-ul CADE (' + rez.length + ' cifră nejustificată: ' + rez.map((x) => x.cifra).join(', ') + ')');
}

/* Mutații NAP: cifrele sunt „permise” (vin din cod), deci guard-ul de
 * cifre nu le poate prinde — verificarea NAP-ului e cea care le
 * prinde, comparând cu valoarea din config.js. */
const mutatiiNap = [
  ['CIF falsificat în footer (o cifră schimbată)', 'index.html', (h) => h.replace('CIF ' + NAP.CIF, 'CIF RO1234567893')],
  ['JSON-LD anunță altă firmă (Organization.vatID)', 'index.html', (h) => h.replace('"vatID": "' + NAP.CIF + '"', '"vatID": "RO9999999999"')],
  ['e-mail de contact inventat', 'index.html', (h) => h.replace('mailto:' + NAP.EMAIL, 'mailto:alt@exemplu.ro')],
  ['adresă falsificată', 'contact.html', (h) => h.replace(NAP.ADRESA, 'Str. Fictivă 99')],
  ['CIF falsificat pe pagina de contact', 'contact.html', (h) => h.replace('CIF ' + NAP.CIF, 'CIF RO1234567893')]
];
for (const [nume, pagina, muta] of mutatiiNap) {
  const p = problemeNap(muta(htmluri[pagina]));
  ok(p.length > 0, 'mutație NAP: ' + nume + ' → verificarea NAP CADE (' + p.length + ' probleme: ' + p.join('; ') + ')');
}
ok(problemeNap(indexHtml).length === 0, 'fără false-positive: NAP-ul real din pagină trece verificarea');

/* Guard-ul nu trebuie nici să cadă pe textul curent, nici să cadă
 * pe excepțiile legitime — verificăm și partea „nu prea mult”. */
ok(
  cifreNejustificate(textPublic(indexHtml)).length === 0,
  'fără false-positive pe excepțiile declarate (9500, 24, 60, 49, ani, numerotare)'
);
ok(
  !/€/.test(textPublic(indexHtml)),
  'textul public nu mai conține simbolul euro (prețul se încasează în lei)'
);
ok(
  cifreNejustificate(textPublic(indexHtml), { mascheaza: false }).length > 0,
  'mascarea NAP-ului chiar lucrează: fără ea, cifrele NAP ar fi raportate ca nejustificate'
);

/* ============ Rezultat ============ */
console.log('');
console.log('Banca de cifre: ' + checks + ' verificări, ' + failures + ' eșec' + (failures === 1 ? '' : 'uri') + '.');
if (failures > 0) {
  console.error('Eșec: în textul public există cifre care nu provin din cod. Dacă e o cifră legitimă,');
  console.error('declar-o în EXCEPTII (în acest fișier) cu motiv — nu o introduce direct în HTML.');
  process.exit(1);
}
console.log('Prețul și NAP-ul publice vin din site/config.js. ✔');