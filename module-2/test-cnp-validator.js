/* ============================================================
 * AutoAct | module-2 | test-cnp-validator.js
 * Suită de teste automate pentru validatorul CNP (nodul 5 n8n).
 * Fiecare caz rulează prin AMBELE implementări (n8n + UI) și
 * cere rezultate identice — nu există două „adevăruri".
 *
 * Acoperire cerută:
 *   ✔ ani bisecți (2000/2024 validi; 1900 & 2023-02-29 invalizi)
 *   ✔ rest 10 → cifra de control 1 (cazul special al algoritmului)
 *   ✔ S invalid (0, 7, 8, 9)
 *   ✔ județ 53 (invalid) + margini 00/01/52
 *   ✔ lungimi greșite (0/5/12/14 cifre, litere, null, undefined)
 *   ✔ regresie: Test Data Kit (5 CNP-uri) + mutații pe cifre
 *
 * Rulare:  node module-2/test-cnp-validator.js
 * Ieșire:  PASS/FAIL detaliat + cod de ieșire 0/1
 * ============================================================ */
'use strict';

const { valideazaCNP: validN8n } = require('./cnp-validator.code-node.js');
const { valideazaCNP: validUI } = require('../site/validare.js');

let total = 0;
let esecuri = 0;
let sectiune = '';

function sectiuneNoua(nume) {
  sectiune = nume;
  console.log('\n--- ' + nume + ' ---');
}

function check(cond, descriere, detaliu) {
  total++;
  if (cond) {
    console.log('PASS  ' + descriere);
  } else {
    esecuri++;
    console.log('FAIL  ' + descriere + (detaliu ? '  [' + detaliu + ']' : ''));
  }
}

/* Generează un CNP valid matematic din componente (aceeași cheie 279146358279). */
function construieste({ s, an, luna, zi, judet, secventa = 1, control }) {
  const pp = (n, l) => String(n).padStart(l, '0');
  const baza = `${s}${pp(an % 100, 2)}${pp(luna, 2)}${pp(zi, 2)}${pp(judet, 2)}${pp(secventa, 3)}`;
  const CHEIE = '279146358279'.split('').map(Number);
  let suma = 0;
  for (let i = 0; i < 12; i++) suma += Number(baza[i]) * CHEIE[i];
  const rest = suma % 11;
  const cifra = control !== undefined ? control : (rest === 10 ? 1 : rest);
  return { cnp: baza + cifra, rest };
}

/* Normalizează diacriticele și cratimele lungi pentru potrivirea mesajelor. */
function norm(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[–—]/g, '-');
}

/* Rulează un caz prin ambele implementări și verifică identitatea + rezultatul. */
function caz(nume, input, expectValid, expectMesaj) {
  const a = validN8n(input);
  const b = validUI(input);
  const identic = JSON.stringify(a) === JSON.stringify(b);
  check(identic, nume + ' — output identic UI ↔ n8n', identic ? '' : JSON.stringify(a) + ' vs ' + JSON.stringify(b));
  check(a.isValid === expectValid, nume + ' — isValid=' + expectValid, 'obtinut: ' + a.isValid + (a.erori.length ? ' (' + a.erori[0] + ')' : ''));
  if (expectMesaj) {
    check(
      a.erori.some((e) => norm(e).includes(norm(expectMesaj))),
      nume + ' — eroare "' + expectMesaj + '"',
      'erori: ' + JSON.stringify(a.erori)
    );
  }
}

/* ============================================================
 * 1. REGRESIE — Test Data Kit (5 CNP-uri fictive valide)
 * ============================================================ */
sectiuneNoua('1. Regresie — Test Data Kit');
const kit = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'module-1', 'test-data-kit.json'), 'utf8')).intrari;
for (const k of kit) {
  const r = validN8n(k.cnp);
  check(r.isValid === true, 'kit #' + k.id_test + ' (' + k.cnp + ') valid', r.erori.join('; '));
}
const meta = validN8n(kit[0].cnp).meta;
check(
  meta && meta.sex === 'masculin' && meta.an_nastere === 1975 && meta.luna_nastere === 3 && meta.zi_nastere === 14 && meta.judet_nastere === 41,
  'meta derivată corect din kit #1 (masculin, 14.03.1975, jud. 41)',
  JSON.stringify(meta)
);

/* ============================================================
 * 2. ANI BISECȚI — 29 februarie
 * ============================================================ */
sectiuneNoua('2. Ani bisecți (29 februarie)');

// 2000 = an bisect (divizibil 400) → valid
const b2000 = construieste({ s: 5, an: 2000, luna: 2, zi: 29, judet: 10, secventa: 7 });
caz('29.02.2000 (bisect, div. 400)', b2000.cnp, true);

// 2024 = an bisect (divizibil 4) → valid
const b2024 = construieste({ s: 1, an: 2024, luna: 2, zi: 29, judet: 12, secventa: 42 });
caz('29.02.2024 (bisect, div. 4)', b2024.cnp, true);

// 2023 NU e bisect → 29.02.2023 respins (data nu există)
const b2023 = construieste({ s: 6, an: 2023, luna: 2, zi: 29, judet: 12, secventa: 42 });
caz('29.02.2023 (ne-bisect)', b2023.cnp, false, 'nu exista in calendar');

// 1900 NU e bisect (div. 100, nu div. 400) → respins; JS Date respectă regula gregoriană
const b1900 = construieste({ s: 1, an: 1900, luna: 2, zi: 29, judet: 41, secventa: 90 });
caz('29.02.1900 (div. 100, nu div. 400)', b1900.cnp, false, 'nu exista in calendar');

// 28.02.2023 e valabil (ziua există, doar 29-ul nu)
const b28 = construieste({ s: 6, an: 2023, luna: 2, zi: 28, judet: 12, secventa: 42 });
caz('28.02.2023 (ultima zi reală a lunii)', b28.cnp, true);

// lunile de 30 de zile: 31.04 nu există
const b31apr = construieste({ s: 2, an: 1990, luna: 4, zi: 31, judet: 20, secventa: 3 });
caz('31.04.1990 (aprilie are 30 zile)', b31apr.cnp, false, 'nu exista in calendar');

/* ============================================================
 * 3. REST 10 → CIFRA DE CONTROL 1 (cazul special)
 * ============================================================ */
sectiuneNoua('3. Rest 10 → cifra de control 1');

// Caută programatic o bază al cărei rest (suma % 11) să fie exact 10.
let rest10 = null;
for (let secv = 0; secv < 1000 && !rest10; secv++) {
  const c = construieste({ s: 1, an: 1975, luna: 3, zi: 14, judet: 41, secventa: secv });
  if (c.rest === 10) rest10 = c;
}
check(!!rest10, 'pre-condiție: am găsit o bază cu rest = 10 (secventa ' + (rest10 ? rest10.cnp.slice(9, 12) : '—') + ')');

if (rest10) {
  // cu cifra de control 1 → SINGURA variantă validă
  caz('rest 10 → control 1 (varianta corectă)', rest10.cnp, true);
  check(rest10.cnp.endsWith('1'), 'cifra de control generată este exact 1', rest10.cnp);

  // cu cifra de control 0 („restul brut") → invalid; demonstrează că regula NU e „restul pur și simplu"
  const cu0 = rest10.cnp.slice(0, 12) + '0';
  caz('rest 10 → control 0 (greșit)', cu0, false, 'incorecta');
}

/* ============================================================
 * 4. S INVALID — prima cifră în afara intervalului 1–6
 * ============================================================ */
sectiuneNoua('4. S invalid (prima cifră)');
for (const s of [0, 7, 8, 9]) {
  const b = construieste({ s, an: 1990, luna: 5, zi: 10, judet: 15, secventa: 11, control: 9 });
  caz('S = ' + s, b.cnp, false, 'S');
}
// marginile valide: S = 1 și S = 6
caz('S = 1 (margine inferioară, valid)', construieste({ s: 1, an: 1990, luna: 5, zi: 10, judet: 15, secventa: 11 }).cnp, true);
caz('S = 6 (margine superioară, valid)', construieste({ s: 6, an: 1990, luna: 5, zi: 10, judet: 15, secventa: 11 }).cnp, true);

/* ============================================================
 * 5. JUDEȚ — 53 invalid + margini 00/01/52
 * ============================================================ */
sectiuneNoua('5. Județ (JJ)');
const jj = (num) => construieste({ s: 4, an: 1995, luna: 7, zi: 20, judet: num, secventa: 5 });
caz('JJ = 53 (prima valoare invalidă)', jj(53).cnp, false, '01-52');
caz('JJ = 99', jj(99).cnp, false, '01-52');
caz('JJ = 00 (sub interval)', jj(0).cnp, false, '01-52');
caz('JJ = 52 (margine superioară, valid)', jj(52).cnp, true);
caz('JJ = 01 (margine inferioară, valid)', jj(1).cnp, true);

/* ============================================================
 * 6. LUNGIMI GREȘITE & input-uri degenerate
 * ============================================================ */
sectiuneNoua('6. Lungimi greșite & input-uri degenerate');
caz('string gol', '', false, '13 cifre');
caz('5 cifre', '12345', false, '13 cifre');
caz('12 cifre (o cifră lipsă)', '175031441123', false, '13 cifre');
caz('14 cifre (o cifră în plus)', '17503144112310', false, '13 cifre');
caz('litere în loc de cifre', '175031441123a', false, '13 cifre');
caz('text arbitrar', 'abc', false, '13 cifre');
caz('null', null, false, '13 cifre');
caz('undefined', undefined, false, '13 cifre');
// coercția la string e intenționată: un număr de 13 cifre ajunge string de 13 cifre
caz('număr JS de 13 cifre (coercție intenționată)', 1750314411231, true);
caz('număr JS prea scurt', 123, false, '13 cifre');

/* ============================================================
 * 7. MUTAȚII PE CIFRE — orice schimbare din primele 12 invalidază
 * ============================================================ */
sectiuneNoua('7. Mutații pe cifre (proprietate checksum)');
const baza = kit[1].cnp; // 6010902122043
let mutatiiOk = 0;
for (let i = 0; i < 12; i++) {
  const cif = Number(baza[i]);
  const altCnp = baza.slice(0, i) + ((cif + 1) % 10) + baza.slice(i + 1);
  const r = validN8n(altCnp);
  if (r.isValid === false) mutatiiOk++;
  else console.log('       poziția ' + i + ' (' + cif + '→' + altCnp[i] + ') a rămas VALIDĂ: ' + altCnp);
}
check(mutatiiOk === 12, 'toate cele 12 mutații din primele cifre invalidază CNP-ul (' + mutatiiOk + '/12)');

// coruperea ultimei cifre (cifra de control) → invalid
caz('cifră de control coruptă (+1 mod 10)', baza.slice(0, 12) + String((Number(baza[12]) + 1) % 10), false, 'incorecta');

/* ============================================================
 * Rezumat
 * ============================================================ */
console.log('\n============================================================');
console.log('TOTAL: ' + total + ' verificări · ' + esecuri + ' eșuate');
console.log(esecuri === 0 ? 'SUITA CNP: TOATE TESTELE TREC ✔' : 'SUITA CNP: EȘUAT ✘');
console.log('============================================================');
process.exit(esecuri === 0 ? 0 : 1);
