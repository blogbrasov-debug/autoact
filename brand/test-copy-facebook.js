/* ============================================================
 * AutoAct | brand/test-copy-facebook.js
 * VERIFICĂ faptul că materialele de pe Facebook nu spun lucruri
 * pe care codul nu le sprijină. Rulează: node brand/test-copy-facebook.js
 * ============================================================
 *
 * DE CE EXISTĂ, pornind de la ce s-a întâmplat la ClarTransfer:
 * textele de pe pagina și din grup promiseau un coridor de transfer
 * care NU exista. S-au corectat în 5 minute, în postări — dar au rămas
 * 3 materiale grafice (.svg, care se încarcă efectiv pe pagină) și o
 * linie de calendar. Textul se rescrie deschizându-l și citindu-l; o
 * imagine nu se corectează decât dacă cineva o redeschide. De aceea
 * verificarea trebuie să CADĂ PE FIȘIER, nu doar să ne lase să-l
 * privim.
 *
 * CE VERIFICĂ, cu sursa de adevăr citită din cod:
 *   1. PREȚUL    — orice „NN lei" trebuie să fie PRET_RON din
 *                  site/config.js. Schimbi prețul în config și, fără
 *                  să corectezi aici, pagina minte public.
 *   2. DOCUMENTE  — orice „NN documente" trebuie să fie numărul real
 *                  de șabloane din module-2/sabloane/.
 *   3. PROMISIUNI — expresii de extindere pe care nu le avem
 *                  („toate orașele", „rețeaua europeană"…).
 *   4. PASTE-READY — în blocurile de cod (textul care se lipește chiar
 *                  în Meta) nu poate apărea NAP-ul placeholder.
 *   5. PNG LA ZI  — un PNG mai vechi decât sursa lui HTML înseamnă
 *                  că se urcă pe pagină o versiune veche, iar textul
 *                  nou rămâne nepublicat. Exact clasa de eroare care
 *                  nu se vede deschizând fișierul.
 *
 * EXCEPȚII, scrise în cod, nu ascunse:
 *   · audit/negativ — orice exemplu de formulare interzisă se pune
 *     între backtick-uri, iar verificarea ignoră codul inline (la fel
 *     ca un document care își arată exemplul fără să se autoproceseze);
 *   · blocurile de cod sunt locul unde verificarea e STRICTĂ, pentru
 *     că acolo se lipește efectiv textul.
 * ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const { PRET_RON, NAP, PLACEHOLDER_NAP } = require('../config-autoact.js');

const RADACINA = path.join(__dirname, '..');
const FB = path.join(__dirname, 'facebook');
const HTML = __dirname;
const PNG = path.join(__dirname, 'png');

let total = 0, esecuri = 0;
const check = (cond, mesaj, detaliu) => {
  total++;
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + mesaj + (!cond && detaliu ? '  → ' + detaliu : ''));
  if (!cond) esecuri++;
};

/* ---------- 1. Surse de adevăr, citite din cod ---------- */

/* Numărul de documente: numărul de șabloane reale, nu un număr scris
 * cu mâna. Dacă se adaugă un al patrulea document, verificarea se
 * strânge singură — și, mai important, CADE dacă textele nu-l urmează. */
const sabloaneDir = path.join(RADACINA, 'module-2', 'sabloane');
const N_DOCUMENTE = fs.readdirSync(sabloaneDir)
  .filter((f) => f.endsWith('.md') && f !== 'README.md').length;
if (N_DOCUMENTE < 1) throw new Error('Nu am găsit niciun șablon în module-2/sabloane — verificarea nu are ce verifica.');

/* Promisiuni de extindere pe care nu le avem. Exemple scrise aici, în
 * comentariu, ca să nu se autoproceseze: verificarea citește fișierele
 * brand/facebook/, nu acest fișier. */
const PROMISIUNI = [
  { re: /toate orasele/i, de_ce: 'nu livrăm în toate orașele' },
  { re: /in Europa/i, de_ce: 'nu livrăm în Europa' },
  { re: /reteaua europeana/i, de_ce: 'nu avem rețea europeană' },
  { re: /toate aeroporturile/i, de_ce: 'nu acoperim toate aeroporturile' },
  { re: /toate tarile/i, de_ce: 'nu livrăm în toate țările' },
  { re: /in orice tara/i, de_ce: 'nu livrăm în orice țară' },
  { re: /rezultat garantat/i, de_ce: 'nu controlăm ce hotărăște funcționarul de la ghișeu' },
  { re: /zero erori intotdeauna/i, de_ce: 'nu se poate garanta asta; se poate spune ce face verificarea' },
  { re: /ti (returnam|trimitem) banii/i, de_ce: 'nu există politică de rambursare' }
];

/* ---------- 2. Textele, cu excepțiile lor ---------- */

/** Fără diacritice, pentru comparație: textele de pe Facebook se scriu
 *  frecvent fără diacritice („orasele", „europa"), iar o verificare care
 *  le caută cu diacritice ar trece orbește peste exact textul care ajunge
 *  public. A fost o mutație reală: „Livram in toate orasele" a trecut
 *  nedetectat până când normalizarea a fost adăugată. */
const faraDiacritice = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Blocurile de cod (```...```) și codul inline (`...`).
 *  Aici stau EXEMPLE de formulare interzisă: trebuie ignorate, sau
 *  documentul care arată ce nu trebuie scris s-ar autoprocesa. */
const faraCod = (t) => faraDiacritice(
  t.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ')
);

/** Doar blocurile de cod — adică textul care se lipește efectiv în Meta.
 *  Aici verificarea e strictă: niciun preț greșit, niciun NAP placeholder. */
const blocuriCod = (t) => (t.match(/```[\s\S]*?```/g) || []).join('\n');

/** Fișierele de pe care se verifică: documentele și materialele grafice.
 *  PNG-urile NU se verifică — ele sunt IEȘIRE, randate din HTML. Verificăm
 *  sursa, și separat că PNG-ul nu e mai vechi decât ea (vezi §5). */
const documente = fs.existsSync(FB)
  ? fs.readdirSync(FB).filter((f) => f.endsWith('.md')).map((f) => path.join(FB, f))
  : [];
const htmluri = fs.existsSync(HTML)
  ? fs.readdirSync(HTML).filter((f) => f.endsWith('.html')).map((f) => path.join(HTML, f))
  : [];
const svguri = fs.existsSync(HTML)
  ? fs.readdirSync(HTML).filter((f) => f.endsWith('.svg')).map((f) => path.join(HTML, f))
  : [];
const toate = [...documente, ...htmluri, ...svguri];

check(toate.length >= 8,
  'există materiale Facebook de verificat (documente + HTML + SVG) — găsite: ' + toate.length,
  'mai puțin de 8 — verificarea nu ar controla nimic');

/* ---------- 3. Prețul și numărul de documente ---------- */

for (const f of toate) {
  const baza = path.basename(f);
  const brut = fs.readFileSync(f, 'utf8');

  /* Prețul și numărul de documente se caută în TEXTUL BRUT, cu blocurile
   * de cod cu tot — fiindcă acolo stă textul care se lipește chiar în
   * pagină (bio-ul, descrierea, mesajele). Prima versiune a acestei
   * verificări le scotea din analiză și, prin urmare, prețul greșit din
   * bio — exact cel mai vizibil loc — trecea nedetectat. O mutație a
   * prins asta și a forțat corectarea. */
  const preturi = [...brut.matchAll(/\b(\d{1,4}(?:[.,]\d{1,2})?)\s*(lei|RON)\b/gi)];
  for (const m of preturi) {
    const v = Number(m[1].replace(',', '.'));
    check(v === PRET_RON,
      baza + ': prețul „' + m[1] + ' ' + m[2] + '” e prețul din config.js (' + PRET_RON + ')',
      'textul public ar anunța un preț pe care site-ul nu îl are');
  }

  /* Documentele: numărul scris în text trebuie să fie cel real. */
  const documenteGasite = [...brut.matchAll(/\b(\d{1,2})\s*(documente|acte|fișiere)\b/gi)];
  for (const m of documenteGasite) {
    check(Number(m[1]) === N_DOCUMENTE,
      baza + ': „' + m[1] + ' ' + m[2] + '” = numărul real de șabloane (' + N_DOCUMENTE + ')',
      'am expune un pachet cu altă lungime decât cel pe care îl generăm');
  }

  /* Promisiunile de extindere se caută FĂRă cod inline: acolo stau
   * exemplele de ce nu se scrie, care trebuie să poată fi arătate fără
   * să se autoproceseze. */
  const text = faraCod(brut);
  for (const p of PROMISIUNI) {
    const gasit = text.match(p.re);
    check(!gasit,
      baza + ': fără promisiuni nesemnate („' + (gasit ? gasit[0] : '') + '")',
      p.de_ce);
  }
}

/* ---------- 4. Textul care se lipește efectiv în Meta ---------- */

const valoriPlaceholder = [
  { valoare: NAP.CIF, nume: 'CIF' },
  { valoare: NAP.REG_COM, nume: 'Registru Comerț' },
  { valoare: NAP.ADRESA, nume: 'adresă' },
  { valoare: NAP.TELEFON, nume: 'telefon' }
].filter((v) => /00000|EXEMPLU/i.test(v.valoare));

for (const f of documente) {
  const baza = path.basename(f);
  const blocuri = blocuriCod(fs.readFileSync(f, 'utf8'));
  for (const v of valoriPlaceholder) {
    check(!blocuri.includes(v.valoare),
      baza + ': textul de lipit nu conține NAP-ul placeholder (' + v.nume + ')',
      'ai de „' + v.valoare + '" într-un bloc de cod — ăsta se copiază direct în pagină');
  }
}

if (valoriPlaceholder.length > 0) {
  check(PLACEHOLDER_NAP === true,
    'NAP-ul e recunoscut ca PLACEHOLDER (deci nu se publică nicăieri)',
    'config-autoact.js nu mai raportează placeholder, dar valorile sunt încă fictive');
  const paginaMd = documente.find((d) => path.basename(d) === 'pagina.md');
  check(!!paginaMd && /PLACEHOLDER/.test(fs.readFileSync(paginaMd, 'utf8')),
    'pagina.md avertizează explicit că NAP-ul e placeholder',
    'cine va configura pagina n-are de unde ști că nu poate salva încă');
} else {
  check(true, 'NAP-ul e complet — nu mai e placeholder de ascuns din materiale');
}

/* ---------- 5. Materialele grafice: PNG-ul e la zi față de sursă ---------- */

/* Regula care lipsește cel mai des: se corectează HTML-ul, se uită
 * randarea, și se urcă pe pagină PNG-ul vechi. Textul nou e „corect"
 * în repo și nimeni nu-l vede nicăieri. */
const cadre = fs.existsSync(PNG) ? fs.readdirSync(PNG).filter((f) => f.endsWith('.png')) : [];
check(cadre.length > 0, 'brand/png/ conține materialele de încărcat — găsite: ' + cadre.length);

for (const c of cadre) {
  const png = path.join(PNG, c);
  const sursa = path.join(HTML, c.replace(/\.png$/, '.html'));
  if (!fs.existsSync(sursa)) {
    check(false, 'PNG ' + c + ' are sursa HTML corespunzătoare', 'nu există ' + path.basename(sursa) + ' — PNG-ul nu mai poate fi regenerat');
    continue;
  }
  check(fs.statSync(png).mtimeMs >= fs.statSync(sursa).mtimeMs,
    'PNG ' + c + ' e randat din sursa curentă (nu mai vechi decât HTML-ul)',
    'rulează node brand/exporta-png.js și comite PNG-ul regenerat');
}

for (const h of htmluri) {
  const png = path.join(PNG, path.basename(h).replace(/\.html$/, '.png'));
  check(fs.existsSync(png), 'HTML ' + path.basename(h) + ' are PNG-ul randat pentru upload',
    'rulează node brand/exporta-png.js');
}

console.log('');
console.log('brand/test-copy-facebook: ' + total + ' verificări · ' + esecuri + ' eșuate');
if (esecuri > 0) {
  console.error('Materialele Facebook spun altceva decât codul. Nu le încărca până nu e corectat.');
  process.exit(1);
}
console.log('Prețul, numărul de documente și PNG-urile se potrivesc cu codul. ✔');