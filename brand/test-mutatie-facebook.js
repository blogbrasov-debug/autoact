/* ============================================================
 * AutoAct | brand/test-mutatie-facebook.js
 * Test de MUTAȚIE pentru brand/test-copy-facebook.js.
 * Rulează: node brand/test-mutatie-facebook.js
 *
 * DE CE: o verificare care doar „merge" nu dovedește că verifică
 * ceva. Fiecare mutație de mai jos strică o materială Facebook în
 * modul în care se strică în realitate, iar gardul TREBUIE să cadă.
 * Dacă o mutație trece, gardul e decorativ — și atunci nu merită
 * născut, pentru că doar dă senzația de siguranță.
 *
 * Două dintre aceste mutații au prins găuri reale ale primei
 * versiuni a gardului, nu doar erori în materiale:
 *   · prețul greșit pus în blocul de cod de lipit trecea, pentru că
 *     verificarea scotea blocurile de cod din analiză — deci exact
 *     bio-ul paginii, cel mai vizibil text, nu era verificat;
 *   · o promisiune scrisă FĂRĂ diacritice („orasele") trecea,
 *     pentru că expresiile căutau cu diacritice — iar textele de pe
 *     Facebook se scriu adesea fără ele.
 * ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const BRAND = __dirname;
const FB = path.join(BRAND, 'facebook');
const HTML = BRAND;
const BAK = path.join(BRAND, '_bk-fb');
const GARDA = path.join(BRAND, 'test-copy-facebook.js');

const MUTATII = [
  {
    nume: 'preț greșit în blocul de cod de lipit (bio: 49 → 39 lei)',
    fisier: path.join(FB, 'pagina.md'),
    aplica: (t) => t.replace('49 lei', '39 lei')
  },
  {
    nume: 'preț greșit în materialul grafic (49 RON → 39 RON)',
    fisier: path.join(HTML, 'facebook-post-durata.html'),
    aplica: (t) => t.replace('49 RON', '39 RON')
  },
  {
    nume: 'număr greșit de documente (3 → 2)',
    fisier: path.join(FB, 'copy-postari-lansare.md'),
    aplica: (t) => t.replace('3 documente', '2 documente')
  },
  {
    nume: 'promisiune nesemnată scrisă FĂRĂ diacritice',
    fisier: path.join(FB, 'pagina.md'),
    aplica: (t) => t.replace('## 2. Bio', '## 2. Bio\n\nLivram in toate orasele.\n')
  },
  {
    nume: 'NAP placeholder intrat într-un bloc de cod',
    fisier: path.join(FB, 'pagina.md'),
    aplica: (t) => t.replace('## 2. Bio', '## 2. Bio\n\n```\nCIF: RO00000000\n```\n')
  },
  { nume: 'PNG mai vechi decât sursa HTML (editat HTML, uitat randarea)', special: 'png-vechi' }
];

let total = 0, esecuri = 0;
const check = (cond, mesaj, detaliu) => {
  total++;
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + mesaj + (!cond && detaliu ? '  → ' + detaliu : ''));
  if (!cond) esecuri++;
};

const ruleazaGarda = () => {
  try {
    const out = execFileSync('node', [GARDA], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { cod: 0, out };
  } catch (e) {
    return { cod: e.status === undefined ? 1 : e.status, out: (e.stdout || '') + (e.stderr || '') };
  }
};

/* Backup cu păstrarea mtime-ului: restaurarea prin scriere schimbă
 * mtime-ul, și atunci PNG-ul ar rămâne „mai vechi decât sursa" pentru
 * mutațiile următoare — reziduu între rulări, nu o gaură a gardului. */
fs.mkdirSync(BAK, { recursive: true });
const salvate = MUTATII.filter((m) => m.fisier).map((m) => {
  const copie = path.join(BAK, path.basename(m.fisier));
  fs.copyFileSync(m.fisier, copie);
  fs.writeFileSync(copie + '.mtime', String(fs.statSync(m.fisier).mtimeMs));
  return { m, copie, mtime: fs.statSync(m.fisier).mtimeMs };
});

try {
  for (const m of MUTATII) {
    if (m.special === 'png-vechi') {
      /* Sursa mai nouă, PNG-ul rămâne vechi: exact situația „corectez
       * textul, urc imaginea veche", care nu se vede deschizând fișierul. */
      const acum = Date.now() / 1000;
      fs.utimesSync(path.join(HTML, 'facebook-profil.html'), acum, acum);
      fs.utimesSync(path.join(HTML, 'png', 'facebook-profil.png'), acum - 3600, acum - 3600);
    } else {
      const original = fs.readFileSync(m.fisier, 'utf8');
      const mutant = m.aplica(original);
      check(mutant !== original, 'mutația „' + m.nume + '” se aplică efectiv',
        'nu s-a găsit textul de înlocuit — mutația ar trece prin lipsa ei, nu prin a gardului');
      fs.writeFileSync(m.fisier, mutant);
    }

    const r = ruleazaGarda();

    /* restaurare */
    if (m.special === 'png-vechi') {
      const acum = Date.now() / 1000;
      fs.utimesSync(path.join(HTML, 'facebook-profil.html'), acum, acum);
      fs.utimesSync(path.join(HTML, 'png', 'facebook-profil.png'), acum, acum);
    } else {
      const s = salvate.find((x) => x.m === m);
      fs.writeFileSync(m.fisier, fs.readFileSync(s.copie, 'utf8'));
      fs.utimesSync(m.fisier, s.mtime / 1000, s.mtime / 1000);
    }

    const primaLinie = r.out.split('\n').find((l) => l.startsWith('FAIL')) || '';
    check(r.cod !== 0, 'gardul CADE la mutația: ' + m.nume + ' (exit ' + r.cod + ')',
      primaLinie ? 'a căzut, dar fără mesaj' : 'a trecut — gardul nu verifică ce pretinde că verifică');
  }
} finally {
  fs.rmSync(BAK, { recursive: true, force: true });
}

/* La ieșire, sursele trebuie să fie exact cum erau. Altfel, un test
 * de mutație care lasă ceva stricat în repo e mai rău decât deloc. */
const final = ruleazaGarda();
check(final.cod === 0, 'gardul trece din nou, sursele restaurate integral',
  final.out.split('\n').find((l) => l.startsWith('FAIL')) || '');

console.log('');
console.log('brand/test-mutatie-facebook: ' + total + ' verificări · ' + esecuri + ' eșuate');
if (esecuri > 0) {
  console.error('Gardul nu prinde regresiile. Nu te baza pe el până nu e reparat.');
  process.exit(1);
}
console.log('Fiecare regresie reală e prinsă de verificare. ✔');