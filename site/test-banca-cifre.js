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
const { PRET_RON, NAP, PLACEHOLDER_NAP, RETENTION_H, EXCEPTII_CIFRE, cifraControlCif,
        PROCESATOR_PLATI, PRAG_REGULARIZARE } = require('../config-autoact.js');

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
  [PRET_RON]: 'prețul pachetului, din site/config.js (singura sursă)'
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
const PAGINI = ['index.html', 'contact.html', 'demo-standalone.html'];
const htmluri = {};
for (const p of PAGINI) {
  const h = fs.readFileSync(rad(p), 'utf8');
  htmluri[p] = h;
  verifica(h, 'site/' + p);
}

/* ============ 2. Șabloanele: nu conține cifre scrise manual ============ */
const SABLOANE = ['index.sablon.html', 'contact.sablon.html'];
for (const p of SABLOANE) {
  const s = fs.readFileSync(rad(p), 'utf8');
  // fără tokenuri, orice cifră din TEXTUL PUBLIC al șablonului ar fi o
  // constantă scrisă manual (atributele tehnice nu sunt text public)
  const faraTokenuri = textPublic(s).replace(/\{\{[A-Z_]+\}\}/g, ' ');
  const nejust = cifreNejustificate(faraTokenuri, { mascheaza: false });
  ok(nejust.length === 0, 'site/' + p + ': nicio cifră scrisă manual în șablon (doar tokenuri)' + (nejust.length ? ' — ' + nejust.map((x) => x.cifra).join(', ') : ''));
  verifica(s, 'site/' + p);
}
const sablon = fs.readFileSync(rad('index.sablon.html'), 'utf8');
const tokenuri = (sablon.match(/\{\{PRET_RON\}\}/g) || []).length;
ok(tokenuri === 5, 'site/index.sablon.html: 5 tokenuri {{PRET_RON}} (html data-pret, meta, hero, buton, JSON-LD) — găsite: ' + tokenuri);
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
  for (const a of adrese) if (!NAP.ADRESA.includes(a.trim())) p.push('adresă straină: ' + a.trim());
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

/* Factura SmartBill preia CIF-ul din .env, iar deploy-ul îl scrie din
 * config.js — altfel pagina ar afișa un CIF și factura altul. */
const deploy = fs.readFileSync(path.join(__dirname, '..', 'module-3', 'deploy-autoact.sh'), 'utf8');
ok(
  deploy.includes('SMARTBILL_VAT_CODE=${AUTOACT_CIF}') && deploy.includes('config-autoact.js'),
  'deploy-autoact.sh scrie SMARTBILL_VAT_CODE din config.js (factura are același CIF ca NAP-ul)'
);
const atribuiriCif = deploy.split(String.fromCharCode(10)).filter((l) => l.includes('SMARTBILL_VAT_CODE='));
const cifScriseManual = atribuiriCif.filter((a) => !a.includes('${AUTOACT_CIF}'));
ok(cifScriseManual.length === 0, 'deploy-autoact.sh nu conține un CIF scris manual' + (cifScriseManual.length ? ' — ' + cifScriseManual.join(' | ') : ''));

/* Deploy-ul trebuie să OPREASCĂ înainte de a atinge serverul dacă NAP-ul
 * e placeholder — altfel .env rămâne cu CIF fictiv și nu se mai repară. */
ok(
  deploy.includes('ALLOW_PLACEHOLDER_NAP') && deploy.includes('PLACEHOLDER_NAP'),
  'deploy-autoact.sh are blocaj pentru NAP placeholder (nu lasă .env cu CIF fictiv)'
);
const pozGuard = deploy.indexOf('PLACEHOLDER_NAP');
const pozPrimaSsh = deploy.indexOf('ssh "$SSH_TARGET"');
ok(pozGuard > 0 && pozGuard < pozPrimaSsh, 'blocajul NAP e evaluat înainte de prima conexiune SSH');
ok(
  deploy.includes("sed -i 's|^SMARTBILL_VAT_CODE="),
  'deploy-autoact.sh reconciliază CIF-ul într-un .env existent (un NAP corectat ulterior ajunge la factură)'
);

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
  PROCESATOR_PLATI === 'paddle' && configJs.includes("PROCESATOR: 'paddle'"),
  'decizia fiscală: procesatorul e Paddle (Merchant of Record) în config.js („' + PROCESATOR_PLATI + '")'
);
ok(
  Number.isInteger(PRAG_REGULARIZARE) && PRAG_REGULARIZARE > 0
    && configJs.includes('PRAG_COMENZI_REGULARIZARE: ' + PRAG_REGULARIZARE),
  'decizia fiscală: pragul de regularizare (' + PRAG_REGULARIZARE + ' comenzi) e citibil din config.js'
);
ok(
  launch.includes('Paddle') && launch.includes('Merchant of Record'),
  'LAUNCH.md: decizia Paddle (Merchant of Record) e documentată, nu doar cod'
);
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
ok(metaDesc.includes(PRET_RON + ' RON'), 'meta description conține prețul din config.js (' + PRET_RON + ' RON)');
const buton = indexHtml.match(/id="btn-plata"[^>]*>([^<]*)</)[1];
ok(buton.includes(String(PRET_RON)), 'butonul de plată conține prețul din config.js — text: „' + buton.trim() + '”');
ok(!indexHtml.includes('{{PRET_RON}}'), 'index.html generat: niciun token neînlocuit');
ok(!/<!--\s*SABLON/.test(indexHtml) && !/SABLON\s+—\s+nu edita/.test(indexHtml), 'index.html generat: nicio notă de build din șablon nu ajunge în pagina publică');
ok(
  (indexHtml.match(/<html lang="ro" data-pret="(\d+)">/) || [])[1] === String(PRET_RON),
  'index.html: <html data-pret> = ' + PRET_RON + ' (fallback-ul din app.js vine tot din config.js)'
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
  ['butonul de plată arată 39 în loc de ' + PRET_RON,
    (h) => h.replace('PLĂTEȘTE ' + PRET_RON + ' RON', 'PLĂTEȘTE 39 RON')],
  ['JSON-LD anunță prețul 39 (Google indexează exact asta)',
    (h) => h.replace('"price": "' + PRET_RON + '"', '"price": "39"')],
  ['meta description promite 59 RON',
    (h) => h.replace('plătești ' + PRET_RON + ' RON, primești', 'plătești 59 RON, primești')],
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