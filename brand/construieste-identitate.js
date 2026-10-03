/* ============================================================
 * AutoAct | brand/construieste-identitate.js
 * Identitatea vizuală pentru Facebook — generată, nu desenată.
 * ============================================================
 * CULORILE NU SE INVENTEZĂ AICI. Sunt citite din `site/styles.css`,
 * adică din același loc de unde le folosește pagina. De aceea, o
 * reclamă nu poate arăta în albastru iar site-ul în alt albastru:
 * schimbi tokenul din CSS și se schimbă amândouă, sau nu se schimbă
 * niciunul. Dacă un token lipsește, generatorul EȘUECĂ — nu inventează
 * o culoare, pentru că o valoare căsnită ar trece invizibil.
 *
 * DE CE HTML + SVG, nu PNG direct: nu există rasterizator pe mașina de
 * dezvoltare (nici ImageMagick, nici librsvg). SVG e sursa editabilă
 * și fără pierderi; PNG-ul se randă din aceleași fișiere, la
 * dimensiunile cerute de Meta, cu browserul.
 *
 * DIMENSIUNI (Meta, 2026):
 *   · fotografie de profil — 1:1, se afișează din 168×168 în colț;
 *     320×320 e rezultatul standard, lizibil și pe mobil.
 *   · imagine de acoperire — 820×312 desktop; pentru ecrane dense
 *     1640×856. Textul trebuie să stea LÂNGĂ centre, nu în mijloc:
 *     avatarele paginii acoperă colțurile.
 *
 * Rulează:  node brand/construieste-identitate.js
 * Ieșire:   brand/*.svg + brand/*.html (randate apoi în PNG)
 * ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const RADACINA = path.join(__dirname, '..');
const OUT = __dirname;

let total = 0, esecuri = 0;
const check = (cond, mesaj, detaliu) => {
  total++;
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + mesaj + (!cond && detaliu ? '  → ' + detaliu : ''));
  if (!cond) esecuri++;
};

const scrie = (nume, continut) => {
  fs.writeFileSync(path.join(OUT, nume), continut);
  console.log('  → ' + nume + '  (' + Math.round(Buffer.byteLength(continut) / 1024) + ' KB)');
};

/* ---------- 1. Paleta vine din site, nu din documentație ---------- */
const css = fs.readFileSync(path.join(RADACINA, 'site', 'styles.css'), 'utf8');

function token(nume, obligatoriu) {
  const m = css.match(new RegExp('--' + nume + ':\\s*(#[0-9a-fA-F]{3,8})'));
  if (!m) {
    if (obligatoriu) {
      console.error('Token lipsă din site/styles.css: --' + nume);
      console.error('Adaugă-l acolo sau nu generează identitatea — altori brandul și site-ul se rup.');
      process.exit(1);
    }
    return null;
  }
  return m[1];
}

const C = {
  albastru: token('albastru', true),
  albastruInchis: token('albastru-închis', true),
  verde: token('verde', true),
  verdeFundal: token('verde-fundal', true),
  galben: token('galben', true),
  galbenFundal: token('galben-fundal', true),
  rosu: token('rosu', true),
  text: token('text', true),
  textSlabit: token('text-slabit', true),
  bordura: token('bordura', true),
  fundal: token('fundal', true)
};

/* Contrastul trebuie verificat, nu presupus. Text alb pe albastru
 * poate fi perfect sau ilizibil în funcție de token — iar o reclamă
 * ilizibilă nu se observă în cod. */
function luminanta(hex) {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c) : h.match(/../g);
  const [r, g, b] = f.map((x) => parseInt(x, 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function raport(a, b) {
  const la = luminanta(a), lb = luminanta(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/* ---------- 2. Identificatorul: document + bifă ---------- */
/* Ideea: un act care se completează singur. Bifă = verificat, bara de
 * progres = „60 de secunde". Elementul trebuie să se citească și la
 * 32 px, unde apare în timeline, deci forme simple, fără text. */
const logoSvg = (dim, culoare, fundalTransparent) => {
  const s = dim / 512;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 512 512" role="img" aria-label="AutoAct">
  <defs>
    <linearGradient id="aa" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${C.albastru}"/>
      <stop offset="100%" stop-color="${C.albastruInchis}"/>
    </linearGradient>
  </defs>
  ${fundalTransparent ? '' : `<rect width="512" height="512" rx="${Math.round(112 * s)}" fill="url(#aa)"/>`}
  <g transform="translate(0 ${fundalTransparent ? 8 : 0})">
    <!-- actul: pagină cu colțul îndoiat -->
    <path d="M150 116 L300 116 L362 178 L362 396 A20 20 0 0 1 342 416 L170 416 A20 20 0 0 1 150 396 Z"
          fill="${fundalTransparent ? 'url(#aa)' : '#ffffff'}" opacity="${fundalTransparent ? 1 : 1}"/>
    <!-- colțul îndoiat -->
    <path d="M300 116 L362 178 L318 178 A18 18 0 0 1 300 160 Z"
          fill="${fundalTransparent ? 'none' : C.albastruInchis}" opacity="${fundalTransparent ? 0 : 0.28}"/>
    <!-- rândurile de text: actul e deja completat -->
    <g stroke="${fundalTransparent ? '#ffffff' : C.bordura}" stroke-width="13" stroke-linecap="round">
      <line x1="196" y1="232" x2="316" y2="232"/>
      <line x1="196" y1="278" x2="316" y2="278"/>
    </g>
    <!-- bifă: verificat -->
    <circle cx="256" cy="352" r="56" fill="${C.verde}"/>
    <path d="M226 352 L248 374 L288 330" fill="none" stroke="#ffffff"
          stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;
};

console.log('— Identitate vizuală AutoAct —');
console.log('  paletă citită din site/styles.css:');
for (const [k, v] of Object.entries(C)) console.log('    --' + k + ': ' + v + ';');
console.log('');

/* ---------- 3. Verificări de lizibilitate ---------- */
check(raport('#ffffff', C.albastru) >= 4.5,
  'alb pe albastru: contrast ' + raport('#ffffff', C.albastru).toFixed(2) + ':1 (WCAG AA cere 4.5)',
  'textul principal ar fi ilizibil pe reclamă');
check(raport(C.text, C.fundal) >= 7,
  'text pe fundal: contrast ' + raport(C.text, C.fundal).toFixed(2) + ':1',
  'corpul de text nu s-ar citi');
check(raport('#ffffff', C.verde) >= 3,
  'alb pe verde (buton/bifă): contrast ' + raport('#ffffff', C.verde).toFixed(2) + ':1',
  'elementul de acțiune s-ar pierde');

/* ---------- 4. Fișierele generate ---------- */
console.log('');
scrie('logo.svg', logoSvg(512, C.albastru, true));
scrie('logo-placuta.svg', logoSvg(512, C.albastru, false));

/* Pagina de randare: fiecare cadru are exact dimensiunea cerută de
 * Meta, ca captura de ecran să fie gata de upload. */
const pagina = (titlu, corp, latime, inaltime) => `<!DOCTYPE html>
<html lang="ro">
<head>
<meta charset="UTF-8">
<title>${titlu}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${C.bordura}; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .cadru { width: ${latime}px; height: ${inaltime}px; overflow: hidden; position: relative; background: ${C.fundal}; }
</style>
</head>
<body>
  <div class="cadru">
${corp}
  </div>
</body>
</html>
`;

const LOGO_INLINE = logoSvg(512, C.albastru, false);

/* --- Fotografie de profil: 320×320, monogramă + text scurt --- */
scrie('facebook-profil.html', pagina('AutoAct · foto de profil',
  `    <div style="width:100%;height:100%;background:linear-gradient(135deg,${C.albastru} 0%,${C.albastruInchis} 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;">
      <div style="width:150px;height:150px;">${LOGO_INLINE.replace('width="512" height="512"', 'width="150" height="150"')}</div>
      <div style="color:#ffffff;font:700 30px/1 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;letter-spacing:.5px;">AutoAct</div>
      <div style="color:#ffffff;opacity:.82;font:500 14px/1 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;letter-spacing:2.5px;text-transform:uppercase;">acte gata în 60s</div>
    </div>`, 320, 320));

/* --- Acoperire: 1640×856. Textul stânga, deoarece avatarul paginii
   acoperă zona din stânga-jos pe mobil și titlul e la dreapta pe
   desktop. Centrul rămâne liber pentru butonul „Adaugă fotografie". --- */
scrie('facebook-acoperire.html', pagina('AutoAct · imagine de acoperire',
  `    <div style="width:100%;height:100%;background:linear-gradient(120deg,${C.albastruInchis} 0%,${C.albastru} 55%,#0b3d91 100%);position:relative;">
      <div style="position:absolute;right:120px;top:50%;transform:translateY(-50%);text-align:right;">
        <div style="color:#ffffff;font:700 78px/1.05 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;">Contract, cerere<br>și declarații</div>
        <div style="color:#ffffff;opacity:.9;font:500 38px/1.3 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;margin-top:22px;">complete din pozele actelor</div>
        <div style="display:inline-block;margin-top:34px;background:${C.verde};color:#ffffff;font:700 30px/1 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;padding:20px 38px;border-radius:14px;">în 60 de secunde · 49 RON</div>
      </div>
      <div style="position:absolute;left:110px;top:50%;transform:translateY(-50%);width:360px;">
        ${LOGO_INLINE.replace('width="512" height="512"', 'width="360" height="360"')}
      </div>
      <div style="position:absolute;inset:0;opacity:.07;background-image:radial-gradient(#ffffff 2px,transparent 2px);background-size:44px 44px;"></div>
    </div>`, 1640, 856));

/* --- Modele de postare: 1080×1080 (pătrat, ocupă mai mult ecran) --- */
const modelPost = (id, stil, corp) => scrie('facebook-post-' + id + '.html', pagina('AutoAct · post ' + id, corp, 1080, 1080));

modelPost('durata', 'durata', `
    <div style="width:100%;height:100%;background:${C.fundal};padding:84px;display:flex;flex-direction:column;justify-content:center;gap:40px;">
      <div style="display:flex;align-items:center;gap:20px;">
        <div style="width:84px;height:84px;">${LOGO_INLINE.replace('width="512" height="512"', 'width="84" height="84"')}</div>
        <div style="font:700 30px/1 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:${C.text};">AutoAct</div>
      </div>
      <div style="font:800 76px/1.06 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:${C.text};">Fotografezi actele.<br><span style="color:${C.albastru};">Primești dosarul gata.</span></div>
      <div style="font:500 32px/1.4 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:${C.textSlabit};max-width:820px;">Contract de vânzare-cumpărare, cerere DRPCIV și declarații fiscale — generate automat din pozele documentelor.</div>
      <div style="display:flex;gap:16px;">
        <div style="background:${C.albastru};color:#ffffff;font:700 28px/1 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;padding:22px 34px;border-radius:12px;">49 RON</div>
        <div style="background:${C.verdeFundal};color:${C.verde};font:700 28px/1 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;padding:22px 34px;border-radius:12px;border:2px solid ${C.verde}">Zero întrebări</div>
      </div>
    </div>`);

modelPost('proces', 'proces', `
    <div style="width:100%;height:100%;background:linear-gradient(135deg,${C.albastru} 0%,${C.albastruInchis} 100%);padding:84px;display:flex;flex-direction:column;justify-content:center;gap:36px;color:#ffffff;">
      <div style="font:700 30px/1 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;letter-spacing:2px;text-transform:uppercase;opacity:.85;">Cum funcționează</div>
      ${[['1', 'Fotografiez actele', 'CI, CIV, talon — cu telefonul'],
         ['2', 'Corectez datele', 'Sistemul extrage tot, eu verific'],
         ['3', 'Plătesc 49 RON', 'Factură pe numele meu, plată securizată'],
         ['4', 'Primesc ZIP-ul', 'Un singur PDF, trimis pe e-mail']]
        .map(([n, t, d]) => `<div style="display:flex;gap:26px;align-items:flex-start;">
          <div style="min-width:56px;height:56px;border-radius:50%;background:${C.verde};display:flex;align-items:center;justify-content:center;font:800 26px/1 system-ui,sans-serif;">${n}</div>
          <div><div style="font:700 36px/1.2 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;">${t}</div>
          <div style="font:400 24px/1.3 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;opacity:.8;">${d}</div></div>
        </div>`).join('')}
    </div>`);

modelPost('intrebare', 'intrebare', `
    <div style="width:100%;height:100%;background:${C.galbenFundal};padding:84px;display:flex;flex-direction:column;justify-content:center;gap:38px;">
      <div style="font:700 30px/1 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:${C.galben};letter-spacing:2px;text-transform:uppercase;">Întrebare de la un client</div>
      <div style="font:800 64px/1.12 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:${C.text};">„Nu știu dacă pot să<br>folosesc actele mele<br>cazate.”</div>
      <div style="display:flex;align-items:center;gap:26px;">
        <div style="width:14px;height:120px;background:${C.albastru};border-radius:8px;"></div>
        <div style="font:500 30px/1.45 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:${C.textSlabit};max-width:760px;">Poți. În România, la înscrierea auto în service, actele cerute sunt cedate sau în original — și devin ale tale. Consultă un notar pentru situația ta exactă.</div>
      </div>
      <div style="font:600 26px/1 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:${C.albastru};">Întreabă altceva → scrie în comentarii</div>
    </div>`);

/* ---------- 5. Verificări finale ---------- */
console.log('');
const obligatorii = ['logo.svg', 'logo-placuta.svg', 'facebook-profil.html',
  'facebook-acoperire.html', 'facebook-post-durata.html',
  'facebook-post-proces.html', 'facebook-post-intrebare.html'];
for (const f of obligatorii) {
  check(fs.existsSync(path.join(OUT, f)) && fs.statSync(path.join(OUT, f)).size > 200,
    'generat: ' + f);
}

/* Dimensiunile cerute de Meta, scrise explicit în HTML: o captură de
 * ecran cu altă mărime e inutilă la upload. */
const acoperire = fs.readFileSync(path.join(OUT, 'facebook-acoperire.html'), 'utf8');
check(/width: 1640px; height: 856px/.test(acoperire),
  'acoperirea e generată la 1640×856 (cerință Meta pentru ecrane dense)');
const profil = fs.readFileSync(path.join(OUT, 'facebook-profil.html'), 'utf8');
check(/width: 320px; height: 320px/.test(profil),
  'fotografia de profil e generată la 320×320 (pătrat 1:1)');

console.log('');
console.log('construieste-identitate: ' + total + ' verificări · ' + esecuri + ' eșuate');
if (esecuri > 0) process.exit(1);
console.log('Identitatea e generată din paleta site-ului. ✔');