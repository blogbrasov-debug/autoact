/* ============================================================
 * AutoAct | verifica-cost-0.js
 * GARD DE BUGET — promisiunea „cost operațional 0 RON”.
 * ============================================================
 * Un cost nu vine din cod, ci din decizii: mărimi un shape, activăm
 * un serviciu plătit, depășim o cotă. Acest test citește ceea ce
 * proiectul *cere* și CĂDĂ dacă cererea iese din cotele gratuite.
 *
 * ⚠️ DE CE EXISTĂ: Oracle a redus pe 15 iunie 2026 contingentul
 * Always Free pentru Ampere A1 de la 4 OCPU / 24 GB la 2 OCPU / 12 GB,
 * fără anunț. Un cont Free-only cu 4/24 este oprit automat; pe un cont
 * PAYG depășirea înseamnă factură reală. Documentația noastră cerea
 * încă 4/24 — deci nimeni nu ar fi plătit, dar serverul ar fi murit.
 * De aceea limita e verificată automat, nu doar documentată.
 *
 * Rulează:  node verifica-cost-0.js
 * Ieșire:   0 = în regulă, 1 = depășire (mesaj spune ce și unde)
 * ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

let total = 0, esecuri = 0;
const check = (cond, mesaj, detaliu) => {
  total++;
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + mesaj + (!cond && detaliu ? '  → ' + detaliu : ''));
  if (!cond) esecuri++;
};

const citeste = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

/* ---------- 1. Limitele oficiale Always Free (la data documentului) ---------- */
const ALWAYS_FREE = {
  OCPU: 2,            // 1.500 OCPU-ore / lună = 2 OCPU la 744 h
  RAM_GB: 12,         // 9.000 GB-ore / lună = 12 GB la 744 h
  VOLUME_GB: 200,     // block storage total
  EGRESS_GB: 10240    // 10 TB / lună transferuri de ieșire
};

/* ---------- 2. Ce cer documentele noastre ----------
 * Nu verificăm doar prima mențiune: o cerere contrară ascunsă mai jos
 * (linia de Shape, un rând de tabel) trebuie prinsă la fel. Singura
 * excepție e mențiunea istorică („a redus DE LA 4 OCPU / 24 GB”), care
 * nu e o cerere, ci o explicație. */
const bp = citeste('BLUEPRINT.md');
const launch = citeste('LAUNCH.md');

/* Config-ul poate fi invalid prin construcție (preț neîntreg, NAP cu
 * cifră de control greșită). Atunci `require` aruncă — și un stack trace
 * nu e un diagnostic. Îl transformăm într-un FAIL cu explicație. */
let configAutoact = null, eroareConfig = null;
try {
  configAutoact = require('./config-autoact.js');
} catch (e) {
  eroareConfig = e.message;
}
check(eroareConfig === null,
  'site/config.js e valid (preț întreg pozitiv, NAP cu cifră de control corectă)',
  eroareConfig || '');

const ISTORIC = /(?:de la|dinspre|reduce[aă]ut)\s+\d+\s*(?:OCPU|vCPU)(?:\s*\/\s*\d+\s*GB(?:\s*RAM)?)?/gi;
function faraIstoric(text) { return text.replace(ISTORIC, ' '); }

function valoriDepasite(text, regex, plafon) {
  const rez = [];
  for (const linie of faraIstoric(text).split('\n')) {
    for (const m of linie.matchAll(regex)) {
      const n = Number(m[1].replace(/\./g, ''));
      if (n > plafon) rez.push({ n, linie: linie.trim().slice(0, 80) });
    }
  }
  return rez;
}

for (const [nume, text] of [['BLUEPRINT.md', bp], ['LAUNCH.md', launch]]) {
  const dep = valoriDepasite(text, /(\d+)\s*(?:OCPU|vCPU)\b(?!\s*-)/gi, ALWAYS_FREE.OCPU);
  check(dep.length === 0,
    nume + ': nicio cerere peste ' + ALWAYS_FREE.OCPU + ' OCPU' +
    (dep.length ? ' → ' + dep.map((d) => d.n + ' OCPU în „' + d.linie + '”').join(' | ') : ''));

  /* RAM se judecă doar pe liniile care descriu shape-ul de compute.
   * Altfel am prinde și boot volume-ul (47 GB), care e plafonat la
   * 200 GB block storage — altă cotă, verificată mai jos. */
  const depRam = valoriDepasite(
    faraIstoric(text).split('\n').filter((l) => /OCPU|vCPU/i.test(l)).join('\n'),
    /(\d+)\s*GB\b(?!\s*-)/gi, ALWAYS_FREE.RAM_GB);
  check(depRam.length === 0,
    nume + ': nicio cerere peste ' + ALWAYS_FREE.RAM_GB + ' GB RAM' +
    (depRam.length ? ' → ' + depRam.map((d) => d.n + ' GB în „' + d.linie + '”').join(' | ') : ''));

  /* Storage: cotă separată, independentă de RAM. */
  const depVol = valoriDepasite(text, /(\d+)\s*GB\s*(?:block\s*storage|storage|disc|boot volume)/gi, ALWAYS_FREE.VOLUME_GB);
  check(depVol.length === 0,
    nume + ': storage cerut sub plafonul Always Free (' + ALWAYS_FREE.VOLUME_GB + ' GB)' +
    (depVol.length ? ' → ' + depVol.map((d) => d.n + ' GB în „' + d.linie + '”').join(' | ') : ''));
}

/* ---------- 3. docker-compose: resurse delimitate, stivă gratuită ---------- */
const compose = citeste('module-3/docker-compose.yml');

/* Serviciile declarate în compose: fiecare trebuie să aibă plafon.
 * Nu verificăm doar limitele existente (ar fi vacuu când nu există
 * niciuna) — verificăm că fiecare serviciu ARE limită, și că suma
 * lor încape în VM.
 *
 * Doar cheile din secțiunea `services:` — volumele de la finalul
 * fișierului sunt la același nivel de indentare și ar fi numite
 * greșit „servicii”. */
const liniiCompose = compose.split('\n');
const idxServices = liniiCompose.findIndex((l) => /^services:\s*$/i.test(l));
const idxTopUrmator = liniiCompose.findIndex((l, i) => i > idxServices && /^[a-z]/i.test(l) && l.trim());
const sectiuneServices = idxTopUrmator === -1
  ? liniiCompose.slice(idxServices + 1)
  : liniiCompose.slice(idxServices + 1, idxTopUrmator);

const servicii = sectiuneServices
  .map((l) => l.match(/^  ([a-z0-9_-]+):\s*$/i))
  .filter(Boolean)
  .map((m) => m[1]);

let sumaMemorie = 0, sumaCpu = 0;

/* Împărțim secțiunea `services` în blocuri, scanând liniile: un serviciu
 * începe la „  nume:” la nivel de două spații și se termină la următorul
 * antet de același nivel. */
const blocuri = new Map();
let curent = null;
for (const linie of sectiuneServices) {
  const antet = linie.match(/^  ([a-z0-9_-]+):\s*$/i);
  if (antet) { curent = antet[1]; blocuri.set(curent, []); continue; }
  if (curent) blocuri.get(curent).push(linie);
}

for (const nume of servicii) {
  const sectiune = (blocuri.get(nume) || []).join('\n');
  const mMem = sectiune.match(/mem_limit:\s*(\d+)([gm])/i);
  const mCpu = sectiune.match(/cpus:\s*['"]?([0-9.]+)/i);

  /* Fără plafon, un container poate prelua toată memoria VM-ului și
   * opri PostgreSQL + n8n împreună — iar VM-ul nu poate fi extins. */
  check(!!mMem,
    'compose: serviciul „' + nume + '” are plafon de memorie (mem_limit)',
    'fără el, un vârf de consum poate opri întregul stack pe un server de 12 GB');
  check(!!mCpu,
    'compose: serviciul „' + nume + '” are plafon de CPU (cpus)',
    'fără el, un container poate consuma întreaga cotă de 2 OCPU');

  if (mMem) {
    const gb = mMem[2].toLowerCase() === 'g' ? Number(mMem[1]) : Number(mMem[1]) / 1024;
    sumaMemorie += gb;
    check(gb > 0 && gb <= ALWAYS_FREE.RAM_GB,
      'compose: „' + nume + '” are ' + gb + ' GB memorie, sub plafonul Always Free (' + ALWAYS_FREE.RAM_GB + ' GB)');
  }
  if (mCpu) {
    const c = Number(mCpu[1]);
    sumaCpu += c;
    check(c > 0 && c <= ALWAYS_FREE.OCPU,
      'compose: „' + nume + '” are ' + c + ' CPU, sub plafonul Always Free (' + ALWAYS_FREE.OCPU + ')');
  }
}

/* Suma e constraintul real: fiecare serviciu poate respectiv indivi-
 * dual și totuși, împreună, să nu încapă pe VM. */
check(sumaMemorie < ALWAYS_FREE.RAM_GB,
  'compose: suma limitelor de memorie (' + sumaMemorie.toFixed(2) + ' GB) lasă loc pentru SO (' +
  (ALWAYS_FREE.RAM_GB - sumaMemorie).toFixed(2) + ' GB liberi din ' + ALWAYS_FREE.RAM_GB + ' GB)',
  'suma ' + sumaMemorie.toFixed(2) + ' GB depășește plafonul de ' + ALWAYS_FREE.RAM_GB + ' GB');
check(sumaCpu <= ALWAYS_FREE.OCPU,
  'compose: suma limitelor de CPU (' + sumaCpu + ') încape în ' + ALWAYS_FREE.OCPU + ' OCPU',
  'suma ' + sumaCpu + ' depășește ' + ALWAYS_FREE.OCPU);

/* Imagini permise în stivă. E o ALLOWLIST, nu o blacklist: o blacklist
 * ar permite orice serviciu plătit nou adăugat mâine (un monitor, un
 * cache, o platformă nouă apărută după ce lista a fost scrisă). Aici
 * orice imagine în plus trebuie să treacă deliberat prin această listă,
 * deci costul nu poate intra pe furiș.
 * Toate trei sunt oficial gratuite și au plan permanent gratuit. */
const IMAGINI_PERMISE = ['postgres:', 'n8nio/n8n', 'caddy:'];
const imaginiFolosite = [...compose.matchAll(/^\s*image:\s*(\S+)/gim)]
  .map((m) => m[1].trim().replace(/^["']|["']$/g, ''));

check(imaginiFolosite.length > 0, 'compose: am găsit imaginile declarate');
for (const img of imaginiFolosite) {
  const permisa = IMAGINI_PERMISE.some((p) => img.startsWith(p));
  check(permisa,
    'compose: imaginea „' + img + '” e în allowlist-ul gratuit',
    'imagine neaprobată — orice serviciu cu plată ar factură lunar; ' +
    'dacă e legitim, adaug-o explicit în IMAGINI_PERMISE cu un motiv');
}

/* ---------- 4. Secretele din .env: niciuna hardcodată ---------- */
/* Ne interesează doar blocul care scrie efectiv .env pe server, nu
 * variabilele shell locale (SSH_TARGET etc.) — acelea nu ajung în .env. */
const deploy = citeste('module-3/deploy-autoact.sh');

/* Formatele lui printf conțin secvența literală `\n` (backslash + n)
 * drept separator, iar valoarea fiecărei chei se oprește la primul
 * `\n` sau la backslash. De aceea parserul e pe șiruri, nu pe regex.
 *
 * Păstrăm și linia completă: expresia care *generează* secretul stă
 * în argumentul lui printf („%s" primit valoarea din openssl), nu în
 * format. Verificarea corectitudinii trebuie să se uite la linie. */
const BS = String.fromCharCode(92);

/* Formatele lui printf folosesc drept separator secvența `\n` — adesea
 * dublată (`\\n`), pentru că rândul e trimis prin ssh într-un singur
 * command. De aceea separatorul e regex, nu literă: orice număr de
 * backslash-uri urmat de `n`. Altfel, după împărțire rămâne un
 * backslash trailing în valoare și comparația cu `%s` nu se potrivește. */
const SEP = new RegExp(BS + BS + '+n');   // unul sau mai multe backslash-uri, apoi `n`
const segmente = (format) => format.split(SEP);

const liniiEnv = deploy.split('\n').filter((l) => /printf\s+'/.test(l) && /\.env/.test(l));
check(liniiEnv.length > 0, 'deploy: am găsit blocul care scrie .env pe server');

/* Cheie → { valoare (din format), linie (locul unde e scrisă) }. */
const scrieri = new Map();for (const linie of liniiEnv) {
    for (const m of linie.matchAll(/printf\s+'([^']*)'/g)) {
      for (const bucata of segmente(m[1])) {
        const i = bucata.indexOf('=');
        if (i < 1) continue;
        const cheie = bucata.slice(0, i).trim();
        const valoare = bucata.slice(i + 1).split(BS)[0].trim();
        if (cheie && !scrieri.has(cheie)) scrieri.set(cheie, { valoare, linie });
      }
    }
  }
const valoare = (k) => (scrieri.has(k) ? scrieri.get(k).valoare : undefined);
const linie = (k) => (scrieri.has(k) ? scrieri.get(k).linie : '');

/* Cheile care trebuie să rămână GOALE, ca să fie completate manual cu secrete reale.
 * STRIPE_WEBHOOK_SECRET e un Signing secret copiat din contul Stripe — nu poate
 * fi generat de deploy; o valoare inventată acolo ar face ca prima plată reală
 * să fie respinsă drept „semnătură invalidă”, fără niciun mesaj util. */
const cheiDeCompletat = ['STRIPE_WEBHOOK_SECRET',
  'GOOGLE_DOCS_TEMPLATE_CONTRACT', 'GOOGLE_DOCS_TEMPLATE_DRPCIV', 'GOOGLE_DOCS_TEMPLATE_DECLARATII'];
for (const k of cheiDeCompletat) {
  const v = valoare(k);
  check(v === '',
    'deploy: ' + k + ' e scrisă goală (se completează manual cu secretul real)',
    v === undefined ? 'cheia nu apare deloc în blocul .env' : 'valoare găsită: „' + v + '”');
}

/* Cheile generate aleator la deploy — niciodată copiate dintr-un exemplu.
 *
 * Verificarea e pe PERECHEA format↔argument a lui `printf`, nu pe linia
 * întreagă: în deploy, expresia generatoare stă în argumentul
 * („%s" primește valoarea din openssl). Un check care s-ar uita doar la
 * linie ar vedea `openssl rand` oriunde în ea — inclusiv după ce cineva
 * a înlocuit formatul cu o parolă fixă, argumentul rămânând neatins. */
const perechiPrintf = (liniaDeploy) => {
  const rez = [];
  for (const l of liniaDeploy.split('\n')) {
    /* Formatul e între apostrofuri (nu conține `'`); argumentul poate fi
     * între ghilimele duble, cu secvențe escăpate („\"$(openssl rand)").
     * De aceea, pentru argument folosim un scanator de caractere, nu
     * regex: un regex greedy pe `\\.` se oprește la `\$(`. */
    for (const m of l.matchAll(/printf\s+'([^']*)'\s*(.*)$/g)) {
      let rest = m[2] || '';
      let argument = '';
      /* Argumentul poate ajunge cu ghilimele escăpate („\"$(...)") — se
       * întâmplă când comanda e trimisă prin ssh într-un rând întreg. */
      const faraSlash = rest.replace(/^\\+/, '');
      if (faraSlash.startsWith('"')) {
        let i = 1;
        while (i < faraSlash.length) {
          if (faraSlash[i] === '\\') { i += 2; continue; }   // pereche escăpată
          if (faraSlash[i] === '"') break;                  // închidere
          i++;
        }
        argument = faraSlash.slice(1, i);
      } else {
        argument = rest.split(/\s/)[0] || '';
      }
      rez.push({ format: m[1], argument });
    }
  }
  return rez;
};

for (const k of ['POSTGRES_PASSWORD', 'N8N_ENCRYPTION_KEY']) {
  /* Găsim scrierea acestei chei și argumentul cu care e apelată. */
  const scriere = perechiPrintf(deploy).find((p) =>
    segmente(p.format).some((b) => b.trim().startsWith(k + '=')));

  check(!!scriere, 'deploy: ' + k + ' e scrisă în blocul .env',
    'cheia nu apare deloc printre apelurile printf');
  if (scriere) {
    /* Formatul trebuie să conțină DOAR substituentul: valoarea vine din
     * argument. Dacă cineva scrie parola chiar în format, `printf` o
     * scrie literal în .env — iar argumentul rămâne neatins, deci o
     * verificare doar pe argument ar trece neobservată. */
    const valoareDinFormat = segmente(scriere.format)
      .find((b) => b.trim().startsWith(k + '='));
    const areDoarSubstituent = valoareDinFormat !== undefined &&
      valoareDinFormat.trim() === k + '=%s';

    check(areDoarSubstituent,
      'deploy: valoarea lui ' + k + ' nu e scrisă în formatul lui printf',
      valoareDinFormat === undefined
        ? 'nu am găsit cheia în format'
        : 'formatul conține o valoare fixă: „' + valoareDinFormat.trim().slice(0, 60) + '”');

    check(/openssl\s+rand/.test(scriere.argument),
      'deploy: ' + k + ' e generată aleator la deploy, nu copiată manual',
      'argumentul lui printf nu generează valoarea: „' + scriere.argument.slice(0, 70) + '”');
  }
}

/* Facturarea e a Stripe („Managed Payments" = Merchant of Record), deci nu
 * mai există cheie de facturare proprie în .env. Prezența uneia ar însemna
 * o a doua factură pentru aceeași plată — deci verificăm ABSENȚA ei. */
check(!/SMARTBILL|NETOPIA/.test(deploy),
  'deploy: nicio cheie Netopia/SmartBill (procesatorul unic e Stripe, Merchant of Record)',
  'a rămas o cheie de facturare/deplată veche, care ar produce o a doua factură');

/* Cheile Stripe trebuie să ajungă în containerul n8n — altfel $env e gol
 * în nodul de semnătură și fiecare plată e respinsă ca nesemnată. */
check(compose.includes('STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}'),
  'compose: STRIPE_WEBHOOK_SECRET ajunge în containerul n8n (altfel $env e gol în nodul de semnătură)');
check(!/SMARTBILL|NETOPIA/.test(compose),
  'compose: nicio cheie Netopia/SmartBill în environment-ul lui n8n');

/* Domeniul vine ca argument al deploy-ului, nu e înscris în script. */
const dom = valoare('DOMAIN');
check(dom !== undefined && /%/.test(dom),
  'deploy: DOMAIN vine ca argument al deploy-ului, nu e înscris în script',
  dom === undefined ? 'cheia nu apare deloc în blocul .env' : 'valoare găsită: „' + dom + '”');

/* Niciun secret real să nu fie lipit ca literal în shell.
 * Privim doar valoarea atribuită unei chei de secret, pe aceeași linie,
 * ca să nu traversăm secvența literală `\n` din formatul lui printf
 * (unde mai multe chei sunt lipite pe un singur rând). O cheie scrisă
 * cu valoare goală e corectă — de aceea pragul cere ca valoarea să
 * fie într-adevăr un șir lung, nu doar prezența cheii. */
const CHEI_SECRET = ['STRIPE_WEBHOOK_SECRET',
  'N8N_ENCRYPTION_KEY', 'POSTGRES_PASSWORD', 'GOOGLE_OAUTH_CLIENT_SECRET'];
const liniiDeploy = deploy.split('\n');
for (const k of CHEI_SECRET) {
  const suspecte = liniiDeploy.filter((l) => {
    if (!l.includes(k + '=')) return false;
    const valoare = l.slice(l.indexOf(k + '=') + k.length + 1)
      .replace(/['"]/g, '').split(String.fromCharCode(92))[0].trim();
    return valoare.length >= 16 && /[A-Za-z]/.test(valoare) && /[A-Za-z0-9]/.test(valoare);
  });
  check(suspecte.length === 0,
    'deploy: cheia secretă „' + k + '” nu are valoare scrisă ca literal',
    suspecte.map((l) => 'linia: ' + l.trim().slice(0, 80)).join(' | '));
}


/* ---------- 5. Marja: cost fix 0, dar NU cost total 0 ---------- */
const { PRET_RON } = configAutoact || { PRET_RON: NaN };

const COSTURI_VARIABILE = [
  { nume: 'OpenAI Vision OCR (5 imagini/comandă)', aproximare: '≈ 0,03 USD ≈ 0,13 RON/comandă' },
  { nume: 'Stripe — procesare plată', aproximare: '≈ 2,54 lei/49 lei (măsurat pe sandbox)' },
  { nume: 'Stripe „Managed Payments" (MoR)', aproximare: '≈ 3,5% + TVA reținută — de reconfirmat live' }
];
console.log('');
console.log('— Costuri care cresc cu volumul (NU sunt 0, dar nici nu blochează) —');
for (const c of COSTURI_VARIABILE) console.log('  · ' + c.nume + ': ' + c.aproximare);
console.log('  Preț client: ' + PRET_RON + ' RON/comandă (din config.js). Marja rămâne confortabil pozitivă la aceste valori,');
console.log('  dar „cost fix 0 RON” e o formulare corectă, nu „cost total 0 RON”.');
console.log('');

/* Gard de marjă: costul variabil NU poate înghiți prețul.
 * Suma e cea mai pesimistă rezonabilă: OCR (~0,13 RON) + procesare Stripe
 * (~2,54 RON măsurată) + comision MoR 3,5% din 49 RON (~1,72 RON) + TVA
 * reținută (8,50 RON, recoverată doar după regularizare). Doar OCR-ul ar
 * fi o asertare aproape vacuă — orice preț întreg valid (minim 1 RON) ar
 * trece peste 5 × 0,13. Cu suma de aici pragul devine real: la preț 49 lei
 * avem 49 > 3 × 12,89, iar o eroare de tipar (49 → 4) ar CĂDEA. */
const costVariabilPerComanda = 0.13 + 2.54 + 1.72 + 8.50;
check(Number.isInteger(PRET_RON) && PRET_RON > costVariabilPerComanda * 3,
  'gard de marjă: prețul din config.js (' + PRET_RON + ' RON) acoperă costul variabil estimat (≈ ' +
  costVariabilPerComanda.toFixed(2) + ' RON/comandă) cu factor minimum 3×',
  'preț ' + PRET_RON + ' RON — marja nu mai e marjă');

/* ---------- 6. Riscuri care nu sunt costuri, dar pot opri serviciul ---------- */
check(bp.includes('2 OCPU') && launch.includes('2 OCPU'),
  'limitele Always Free reduse sunt documentate în ambele documente (nu doar în unul)');
check(/idle|reclaim/i.test(bp + launch),
  'riscul de reclaim al resurselor inactive e documentat (nu e un cost, dar oprește serviciul)');

console.log('');
console.log('verifica-cost-0: ' + total + ' verificări · ' + esecuri + ' eșuate');
if (esecuri > 0) {
  console.error('COST: proiectul cere resurse dincolo de cotele gratuite. Corectează înainte de deploy.');
  process.exit(1);
}
console.log('Cerințele rămân în cotele gratuite. ✔');