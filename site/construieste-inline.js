/**
 * AutoAct | site | construieste-inline.js
 * Builder-ul site-ului. Trei etape, în ordine:
 *
 *   1. Randă FIECARE site/*.sablon.html → site/*.html, înlocuind
 *      tokenurile {{PRET_RON}}, {{CIF}}, {{ADRESA}}… cu valorile din
 *      site/config.js (sursa unică). Textul public nu conține cifre
 *      scrise manual — nici prețul, nici NAP-ul.
 *   2. Asamblează site/demo-standalone.html din index.html, cu CSS+JS
 *      inline într-un singur fișier (preview local fără server, demo
 *      partajabil pe Discord/WhatsApp).
 *   3. Verifică că prețul apare în pagina principală.
 *
 * Production rămâne pe fișierele separate din site/ (cache-abile).
 *
 * Rulare:  node site/construieste-inline.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { PRET_RON, PRET_EUR, PRET_EUR_AFISAT, NAP, RETENTION_H } = require('../config-autoact.js');

const citeste = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

/* ---------- 1. Tokenuri: singura punte config.js → pagini ---------- */
const TOKENURI = {
  PRET_RON: String(PRET_RON),
  PRET_EUR: String(PRET_EUR),
  PRET_EUR_AFISAT,
  CIF: NAP.CIF,
  REG_COM: NAP.REG_COM,
  ADRESA: NAP.ADRESA,
  TELEFON: NAP.TELEFON,
  EMAIL: NAP.EMAIL,
  DENUMIRE: NAP.DENUMIRE,
  SITE_URL: NAP.SITE,
  RETENTION_H: String(RETENTION_H)
};

/* ---------- 2. Randare pagini ---------- */
const sabloane = fs.readdirSync(__dirname).filter((f) => f.endsWith('.sablon.html')).sort();
if (sabloane.length === 0) throw new Error('niciun *.sablon.html în site/ — nu am ce construi');

for (const sablon of sabloane) {
  const iesire = sablon.replace(/\.sablon\.html$/, '.html');
  let html = citeste(sablon);

  // note de build din șablon: nu ajung în pagina publică
  html = html.replace(/<!--\s*SABLON[^>]*-->\s*/g, '');

  let inlocuite = 0;
  html = html.replace(/\{\{([A-Z_]+)\}\}/g, (m, cheie) => {
    if (!(cheie in TOKENURI)) throw new Error(sablon + ': token necunoscut „' + m + '”');
    inlocuite++;
    return TOKENURI[cheie];
  });
  if (html.includes('{{')) throw new Error(sablon + ': au rămas tokenuri neînlocuite');
  if (/SABLON\s+—\s+nu edita/.test(html)) throw new Error(sablon + ': nota de build a ajuns în pagina generată');

  fs.writeFileSync(path.join(__dirname, iesire), html);
  console.log('OK → site/' + iesire + ' (' + inlocuite + ' tokenuri din config.js: ' + sablon + ')');
}

/* ---------- 3. Demo single-file ---------- */
let html = citeste('index.html');

html = html.replace(
  /<link rel="stylesheet" href="styles.css">/,
  () => '<style>\n' + citeste('styles.css') + '\n</style>'
);

// JS inline (ordinea din index.html: config, validare, demo-data, app)
for (const f of ['config.js', 'validare.js', 'demo-data.js', 'app.js']) {
  const tag = new RegExp('<script src="' + f + '"></script>');
  if (!tag.test(html)) throw new Error('tag negăsit pentru ' + f);
  html = html.replace(tag, () => '<script>\n' + citeste(f) + '\n</script>');
}

if (/src="(config|validare|demo-data|app)\.js"/.test(html) || /href="styles\.css"/.test(html)) {
  throw new Error('au rămas referințe ne-inline');
}

const OUT = path.join(__dirname, 'demo-standalone.html');
fs.writeFileSync(OUT, html);
console.log('OK → site/demo-standalone.html (' + Math.round(html.length / 1024) + ' KB)');

/* Coerență: prețul afișat trebuie să fie cel din config.js, peste tot */
const aparitii = html.split(PRET_EUR_AFISAT).length - 1;
if (aparitii < 3) {
  throw new Error('index.html: prețul afișat „' + PRET_EUR_AFISAT + '" apare de ' + aparitii + ' ori, așteptam minimum 3');
}