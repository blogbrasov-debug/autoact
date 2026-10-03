/* ============================================================
 * AutoAct | site | construieste-og.js
 * Ce văd cei din AFARĂ: etichete de partajare, sitemap, robots.
 *
 *  Rulează:  node site/construieste-og.js
 *  După:     node site/construieste-inline.js
 *
 * ─── De ce există ────────────────────────────────────────────
 * Când cineva partajează un link spre autoact.eu într-un
 * comentariu de pe pagina de Facebook, într-un mesaj privat sau în
 * grup, Facebook NU citește <title> și <meta description>. Citesc
 * etichetele `og:`. Fără ele, linkul apare ca un URL gol: fără
 * titlu, fără imagine, deci fără motiv de clic. Era exact starea
 * inițială a site-ului: zero etichete `og:`.
 *
 * Fiecare pagină își are titlul propriu, pentru că același link
 * trimis pe pagina și în grup trebuie să arate ce e pe pagina lui,
 * nu descrierea generică a site-ului. Facebook nu alege — folosește
 * ce găsește la destinație.
 *
 * ─── Reguli pe care le ține scriptul ─────────────────────────
 * · imaginea de partajare e la adresa pe care o declară og:image
 *   (altfel Facebook afișează cardul fără imagine, tăcut);
 * · un singur og:title și un singur og:image pe pagină — cu două,
 *   Facebook alege la întâmplare;
 * · fiecare URL din sitemap corespunde unei pagini care există
 *   efectiv — un sitemap cu adrese moarte e mai rău decât deluc;
 * · nicio cifră scrisă cu mâna: prețul și NAP-ul vin din config.js.
 * ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const { PRET_AFISAT, NAP } = require('../config-autoact.js');

const SITE_URL = NAP.SITE.replace(/\/+$/, '');
const OG_IMAGINE = SITE_URL + '/og-imagine.png';

/* Descrieri per pagină. Singurul număr care apare în text vine de
 * la config.js, prin PRET_AFISAT. */
const PAGINI = {
  'index.html': {
    titlu: 'AutoAct — pachet de acte pentru vânzarea mașinii',
    descriere: 'Încarci pozele actelor, verifici datele înainte de plată și primești contractul, cererea DRPCIV și declarațiile fiscale. ' + PRET_AFISAT + ' cu TVA inclus.',
    tip: 'website'
  },
  'contact.html': {
    titlu: 'Contact — AutoAct',
    descriere: 'Date de contact și întrebări despre pachetul de acte pentru transcriere auto. Răspundem în zilele lucrătoare.',
    tip: 'website'
  },
  'termeni.html': {
    titlu: 'Termeni și condiții — AutoAct',
    descriere: 'Ce plătești, ce primești și ce nu acoperim: ' + PRET_AFISAT + ' cu TVA inclus, 3 documente, factură emisă de Stripe.',
    tip: 'article'
  },
  'gdpr.html': {
    titlu: 'Politica GDPR — AutoAct',
    descriere: 'Ce date personale prelucrăm, cine le mai atinge și cât timp le păstrăm. Curățare automată după livrare.',
    tip: 'article'
  }
};

const numePagini = Object.keys(PAGINI);

/* Demo-ul autonom nu se indexează: nu are adresă proprie și nu are
 * sens la indexat. Motivul e scris aici, ca excluderea să fie
 * verificabilă și nu doar să „se știe". */
const EXCLUSE_DIN_SITEMAP = ['demo-standalone.html'];

let total = 0, esecuri = 0;
function check(cond, mesaj, detaliu) {
  total++;
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + mesaj + (!cond && detaliu ? '  → ' + detaliu : ''));
  if (!cond) esecuri++;
}

/* Adresa canonică a unei pagini: rădăcina se termină cu slash,
 * celelalte nu. Facebook tratează cele două forme ca pagini
 * diferite când construiește previzualizarea. */
function urlPentru(nume) {
  if (nume === 'index.html') return SITE_URL + '/';
  return SITE_URL + '/' + nume.replace('.html', '');
}

/* Valoarea primului atribut găsit. */
function atribut(continut, cheie) {
  const marcaj = cheie + '" content="';
  const i = continut.indexOf(marcaj);
  if (i < 0) return null;
  const rest = continut.slice(i + marcaj.length);
  const j = rest.indexOf('"');
  return j < 0 ? null : rest.slice(0, j);
}

/* De câte ori apare o etichetă — ca să prindem duplicatele. */
function aparitii(continut, cheie) {
  return continut.split(cheie + '" content="').length - 1;
}

function etichete(nume) {
  const t = PAGINI[nume];
  return [
    '  <meta property="og:type" content="' + t.tip + '">',
    '  <meta property="og:site_name" content="' + NAP.DENUMIRE + '">',
    '  <meta property="og:locale" content="ro_RO">',
    '  <meta property="og:title" content="' + t.titlu + '">',
    '  <meta property="og:description" content="' + t.descriere + '">',
    '  <meta property="og:url" content="' + urlPentru(nume) + '">',
    '  <meta property="og:image" content="' + OG_IMAGINE + '">',
    '  <meta property="og:image:width" content="1200">',
    '  <meta property="og:image:height" content="630">',
    '  <meta property="og:image:alt" content="' + NAP.DENUMIRE + ' — actele gata din pozele tale">',
    '  <meta name="twitter:card" content="summary_large_image">'
  ].join('\n');
}

/* ---------- 1. Imaginea trebuie să fie la adresa declarată ---------- */
const sursaImagine = path.join(__dirname, '..', 'brand', 'png', 'og-imagine.png');
const tintaImagine = path.join(__dirname, 'og-imagine.png');
if (!fs.existsSync(sursaImagine)) {
  check(false, 'brand/png/og-imagine.png există',
    'rulează node brand/construieste-identitate.js și node brand/exporta-png.js');
} else {
  const nou = fs.readFileSync(sursaImagine);
  const vechi = fs.existsSync(tintaImagine) ? fs.readFileSync(tintaImagine) : null;
  if (!vechi || !nou.equals(vechi)) fs.copyFileSync(sursaImagine, tintaImagine);
  check(fs.existsSync(tintaImagine),
    'site/og-imagine.png există — adresa promisă de og:image nu va da 404');
}

/* ---------- 2. Inserarea etichetelor (idempotentă) ---------- */
for (const nume of numePagini) {
  const f = path.join(__dirname, nume);
  if (!fs.existsSync(f)) {
    check(false, 'site/' + nume + ' există', 'rulează întâi node site/construieste-inline.js');
    continue;
  }
  let html = fs.readFileSync(f, 'utf8');
  /* Curățăm etichetele existente ca să nu dublăm: pasul rulează în
   * fiecare build, iar două og:title diferite lasă Facebook să aleagă
   * la întâmplare ce card arată. */
  html = html.replace(/^[ \t]*<meta property="og:[^\n]*\n/gm, '');
  html = html.replace(/^[ \t]*<meta name="twitter:card"[^\n]*\n/gm, '');
  if (html.indexOf('</head>') < 0) {
    check(false, 'site/' + nume + ' are </head>');
    continue;
  }
  html = html.replace('</head>', etichete(nume) + '\n</head>');
  fs.writeFileSync(f, html);
}

/* ---------- 3. sitemap.xml + robots.txt ---------- */
const paginiIndexabile = numePagini.filter((nume) => EXCLUSE_DIN_SITEMAP.indexOf(nume) < 0);
const dataCurenta = new Date().toISOString().slice(0, 10);

const liniiUrl = paginiIndexabile.map((nume) =>
  '  <url>\n    <loc>' + urlPentru(nume) + '</loc>\n    <lastmod>' + dataCurenta + '</lastmod>\n  </url>'
).join('\n');
fs.writeFileSync(path.join(__dirname, 'sitemap.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  liniiUrl + '\n</urlset>\n', 'utf8');

fs.writeFileSync(path.join(__dirname, 'robots.txt'),
  'User-agent: *\n' +
  'Allow: /\n' +
  'Disallow: /webhook/\n' +
  'Disallow: /n8n/\n' +
  'Disallow: /*.sablon.html\n' +
  'Disallow: /construieste-*.js\n' +
  'Sitemap: ' + SITE_URL + '/sitemap.xml\n', 'utf8');

/* ---------- 4. Verificări ---------- */
for (const nume of numePagini) {
  const f = path.join(__dirname, nume);
  if (!fs.existsSync(f)) continue;
  const h = fs.readFileSync(f, 'utf8');

  check(aparitii(h, 'og:title') === 1 && aparitii(h, 'og:description') === 1,
    'site/' + nume + ': exact un og:title și un og:description',
    'titlu x' + aparitii(h, 'og:title') + ', descriere x' + aparitii(h, 'og:description'));

  /* O singură imagine, aceeași pe toate paginile: un link către
   * /contact și unul către / trebuie să arate la fel. */
  check(aparitii(h, 'og:image') === 1 && atribut(h, 'og:image') === OG_IMAGINE,
    'site/' + nume + ': o singură imagine de partajare, identică pe toate paginile',
    'x' + aparitii(h, 'og:image') + ', valoare: ' + atribut(h, 'og:image'));

  check(atribut(h, 'og:url') === urlPentru(nume),
    'site/' + nume + ': og:url e adresa pagei (' + urlPentru(nume) + ')',
    'găsit: ' + atribut(h, 'og:url'));

  check(atribut(h, 'og:site_name') === NAP.DENUMIRE,
    'site/' + nume + ': og:site_name vine din config.js');

  /* Facebook taie descrierea fără niciun avertisment. */
  const d = PAGINI[nume].descriere;
  check(d.length <= 200,
    'site/' + nume + ': descrierea încape în previzualizare (' + d.length + '/200)');

  const deLaOg = h.slice(h.indexOf('og:type')).split('</head>')[0];
  check(deLaOg.indexOf('{{') === -1,
    'site/' + nume + ': niciun token neînlocuit în etichetele og:');
}

check(fs.existsSync(path.join(__dirname, 'sitemap.xml')), 'site/sitemap.xml generat');
check(fs.existsSync(path.join(__dirname, 'robots.txt')), 'site/robots.txt generat');
check(fs.readFileSync(path.join(__dirname, 'robots.txt'), 'utf8').indexOf(SITE_URL + '/sitemap.xml') >= 0,
  'robots.txt declară adresa sitemap-ului, luată din config.js');

/* Un sitemap cu adrese care dau 404 e mai rău decât niciun sitemap:
 * trimite robotul în pagini inexistente și scade încrederea site-ului. */
for (const nume of paginiIndexabile) {
  check(fs.existsSync(path.join(__dirname, nume)),
    'sitemap: adresa ' + urlPentru(nume) + ' corespunde unei pagini existente',
    'pagina ' + nume + ' lipsește — URL-ul din sitemap ar da 404');
}

/* Și invers: o pagină publică uitată din sitemap nu se găsește. */
for (const f of fs.readdirSync(__dirname)) {
  if (!f.endsWith('.html') || f.endsWith('.sablon.html')) continue;
  const motiv = EXCLUSE_DIN_SITEMAP.indexOf(f) >= 0;
  check(motiv || paginiIndexabile.indexOf(f) >= 0,
    'pagina ' + f + ' e fie în sitemap, fie exclusă în mod justificat',
    'pagina publică nu apare în sitemap și nici nu e motivată excluderea');
}

console.log('');
console.log('site/construieste-og: ' + total + ' verificări · ' + esecuri + ' eșuate');
if (esecuri > 0) {
  console.error('Linkurile postate pe Facebook ar arăta fără titlu sau cu adresa greșită.');
  process.exit(1);
}
console.log('Orice link spre autoact.eu arată un card complet. ✔');