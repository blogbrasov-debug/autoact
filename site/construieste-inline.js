/**
 * AutoAct | site | construieste-inline.js
 * Generează site/demo-standalone.html: pagina completă cu CSS+JS inline
 * într-un singur fișier — utilă pentru:
 *   * preview local fără server static,
 *   * demo partajabil (îl trimiți cuiva pe Discord/WhatsApp și merge direct),
 *   * Netlify Drop într-un singur fișier.
 * Production rămâne pe fișierele separate din site/ (cache-abile).
 *
 * Rulare:  node site/construieste-inline.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const citeste = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

let html = citeste('index.html');

// CSS inline
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
console.log('OK → ' + OUT + ' (' + Math.round(html.length / 1024) + ' KB)');
