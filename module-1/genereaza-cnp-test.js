/**
 * AutoAct | Module 1 | Test Data Kit – generator
 *
 * Generează 5 CNP-uri 100% FICTIVE, matematic valide conform algoritmului
 * național (cheia 279146358279), plus seturi de date test coerente
 * (VIN fără I/O/Q, plăcuțe, serii CI) pentru testarea end-to-end.
 *
 * Rulare:   node module-1/genereaza-cnp-test.js
 * Ieșire:   module-1/test-data-kit.json
 *
 * ATENȚIE: datele sunt inventate. NU folosi CNP-uri reale în teste.
 */
const fs = require('fs');
const path = require('path');
const { valideazaCNP } = require('../module-2/cnp-validator.code-node.js');

function construiesteCNP({ s, an, luna, zi, judet, secventa }) {
  const p = (n, l) => String(n).padStart(l, '0');
  const baza = `${s}${p(an % 100, 2)}${p(luna, 2)}${p(zi, 2)}${p(judet, 2)}${p(secventa, 3)}`;
  const CHEIE = '279146358279'.split('').map(Number);
  let suma = 0;
  for (let i = 0; i < 12; i++) suma += Number(baza[i]) * CHEIE[i];
  const rest = suma % 11;
  return baza + (rest === 10 ? 1 : rest);
}

const profiluri = [
  { rol: 'Vanzator #1 (test)', s: 1, an: 1975, luna: 3, zi: 14, judet: 41, secventa: 123,
    nume: 'Popescu Andrei-Ionut', adresa: 'Str. Libertatii nr. 12, bl. A2, ap. 7',
    localitate: 'Bucuresti (Sector 1)', judet_nume: 'Bucuresti Sector 1', seria_ci: 'RX123456',
    vin: 'VF1RFA00567890123', placuta: 'B-123-ABC' },
  { rol: 'Cumparator #1 (test)', s: 6, an: 2001, luna: 9, zi: 2, judet: 12, secventa: 204,
    nume: 'Marinescu Elena-Roxana', adresa: 'Calea Turzii nr. 88',
    localitate: 'Cluj-Napoca', judet_nume: 'Cluj', seria_ci: 'YA234567',
    vin: 'WVWZZZ16Z12345678', placuta: 'CJ-204-XYZ' },
  { rol: 'Vanzator #2 (test)', s: 2, an: 1988, luna: 11, zi: 23, judet: 36, secventa: 17,
    nume: 'Ionescu Mihaela-Gabriela', adresa: 'Bd. Liviu Rebreanu nr. 4',
    localitate: 'Timisoara', judet_nume: 'Timis', seria_ci: 'KP345678',
    vin: 'UU1HSDC0512345678', placuta: 'TM-88-DEF' },
  { rol: 'Cumparator #2 (test)', s: 5, an: 2003, luna: 5, zi: 30, judet: 23, secventa: 456,
    nume: 'Dumitru Alexandru-Mihai', adresa: 'Str. Pacurari nr. 21',
    localitate: 'Iasi', judet_nume: 'Iasi', seria_ci: 'NT456789',
    vin: 'TMMA12A3D0K123456', placuta: 'IS-456-GHJ' },
  { rol: 'Test secol 1900 / Sector 5', s: 1, an: 1965, luna: 1, zi: 8, judet: 45, secventa: 90,
    nume: 'Georgescu Radu-Cristian', adresa: 'Bd. Dacia nr. 50',
    localitate: 'Bucuresti (Sector 5)', judet_nume: 'Bucuresti Sector 5', seria_ci: 'ZA567890',
    vin: 'SALVA13B7FH123456', placuta: 'B-90-JKL' }
];

const kit = profiluri.map((p, idx) => {
  const cnp = construiesteCNP(p);
  const v = valideazaCNP(cnp);
  if (!v.isValid) throw new Error('CNP generat INVALID: ' + cnp + ' → ' + v.erori.join(' | '));
  return {
    id_test: idx + 1,
    rol: p.rol,
    cnp: cnp,
    valid: v.isValid,
    derivat_din_cnp: v.meta,
    nume_fictiv: p.nume,
    adresa_fictiva: p.adresa,
    localitate: p.localitate,
    judet: p.judet_nume,
    serie_ci_fictiva: p.seria_ci,
    vin_fictiv: p.vin,
    placuta_fictiva: p.placuta,
    pret_test_ron: 49
  };
});

// Sanity check: toate VIN-urile au 17 caractere și nu conțin I, O, Q.
for (const k of kit) {
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(k.vin_fictiv)) {
    throw new Error('VIN de test invalid (17 caractere, fara I/O/Q): ' + k.vin_fictiv);
  }
}

const iesire = {
  disclaimer: 'Date 100% fictive, generate algoritmic pentru testare. Orice coincidenta cu persoane reale este intamplatoare. NU utiliza CNP-uri reale in medii de test.',
  algoritm: 'cheie 279146358279 | rest % 11 | rest 10 => cifra control 1',
  generat_la: new Date().toISOString(),
  intrari: kit
};

const outPath = path.join(__dirname, 'test-data-kit.json');
fs.writeFileSync(outPath, JSON.stringify(iesire, null, 2) + '\n');

console.table(kit.map((k) => ({ cnp: k.cnp, rol: k.rol, valid: k.valid })));
console.log('OK → ' + outPath);
