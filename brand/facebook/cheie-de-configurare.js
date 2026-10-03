/* ============================================================
 * AutoAct | brand/facebook/cheie-de-configurare.js
 * Generează brand/facebook/cheie-de-configurare.html — o singură
 * pagină locală cu TOATE câmpurile paginii Facebook, fiecare cu
 * valoarea lui gata de copiat.
 *
 *  Rulează: node brand/facebook/cheie-de-configurare.js
 *
 * DE CE: textele sunt în trei fișiere .md, iar imaginile stau în
 * brand/png/. În timpul configurării, fiecare câmp înseamnă un
 * salt între documente și un „de unde era cifra asta?". O cheie
 * unică elimină saltul: totul pe un ecran, cu imaginea lângă
 * câmpul în care se încarcă.
 *
 * TOTUL vine din cod: prețul și NAP-ul din config.js, imaginile
 * din brand/png/, textele din aceste fișiere. Dacă se schimbă
 * sursa, se schimbă și cheia — nu există o a treia copie a
 * numărului undeva, unde ar putea rămâne veche.
 * ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const { PRET_RON, PRET_AFISAT, NAP, PLACEHOLDER_NAP, PLACEHOLDER_LEGAL, LEGAL } = require('../../config-autoact.js');

const DIR = __dirname;
const PNG = path.join(DIR, '..', 'png');
const IERI = path.join(DIR, '..', 'og-imagine.html');

let total = 0, esecuri = 0;
const check = (cond, mesaj, detaliu) => {
  total++;
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + mesaj + (!cond && detaliu ? '  → ' + detaliu : ''));
  if (!cond) esecuri++;
};

/* Textele sunt citite din documentele care sunt adevărul, nu copiate
 * aici: altfel cheia ar deveni încă o sursă care se desincronizează. */
const citeste = (nume) => fs.readFileSync(path.join(DIR, nume), 'utf8');
const paginaMd = citeste('pagina.md');
const grupMd = citeste('grup-clienti.md');
const postariMd = citeste('copy-postari-lansare.md');

/* Blocul de cod imediat după un titlu — așa sunt scrise textele. */
function blocDupa(titlu, sursa) {
  const i = sursa.indexOf(titlu);
  if (i < 0) return '';
  const rest = sursa.slice(i + titlu.length);
  const m = rest.match(/```\n([\s\S]*?)\n```/);
  return m ? m[1] : '';
}

const BIO = blocDupa('## 2. Bio', paginaMd);
const DESCRIERE = blocDupa('## 3. Descriere', paginaMd);
const REGULI_GRUP = blocDupa('## 4. Regulile grupului', grupMd);
const MESAJ_FIXAT = blocDupa('## 3. Mesajul fixat', grupMd);
const POSTARE_1 = blocDupa('## 1. Prima postare', postariMd);

/* Dimensiunile se citesc din PNG-urile reale — tabelul din pagina.md
 * a fost corectat o dată, și n-are rost să reintroducem aceeași eroare. */
function dimensiuni(fisier) {
  const b = fs.readFileSync(path.join(PNG, fisier));
  return { lat: b.readUInt32BE(16), inalt: b.readUInt32BE(20), dataUri: 'data:image/png;base64,' + b.toString('base64') };
}

const IMAGINI = [
  { fisier: 'facebook-profil.png', camp: 'Fotografie de profil' },
  { fisier: 'facebook-acoperire.png', camp: 'Imagine de acoperire' },
  { fisier: 'facebook-post-durata.png', camp: 'Postare — durează 60 de secunde' },
  { fisier: 'facebook-post-proces.png', camp: 'Postare — procesul' },
  { fisier: 'facebook-post-intrebare.png', camp: 'Postare — întrebarea' }
].map((i) => Object.assign(i, dimensiuni(i.fisier)));

/* Marcaj vizibil pentru orice valoare care nu poate fi completată încă.
 * Cheia nu ascunde nimic: ce e de completat e scris cu roșu, în fața
 * ochilor, nu într-un document în care se uită cineva. */
const campNap = (eticheta, valoare, blocaj) => `
      <div class="rand">
        <div class="eticheta">${eticheta}</div>
        <div class="valoare${blocaj ? ' blocaj' : ''}">${blocaj
          ? '<strong>NU SALVA DEOCUM.</strong> ' + blocaj + '<br><code>' + valoare + '</code>'
          : valoare}</div>
      </div>`;

const ATENTIE = `
    <div class="banner ${PLACEHOLDER_NAP ? 'rosu' : 'verde'}">
      <strong>${PLACEHOLDER_NAP ? 'NU completa adresa, telefonul și e-mailul pe pagina.' : 'NAP-ul e complet — poți completa datele de contact.'}</strong>
      NAP-ul din <code>site/config.js</code> e încă <em>placeholder</em>
      (<code>${NAP.CIF}</code>, <code>${NAP.TELEFON}</code>). Dacă le apeși aici, publici
      date fictive pe o pagină publică, iar cine a văzut-o le-a văzut. Completează
      NAP-ul în <code>site/config.js</code>, rulează din nou acest script, și abia apoi
      completează pagina.
    </div>`;

const html = `<!DOCTYPE html>
<html lang="ro">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Cheie de configurare — pagina Facebook AutoAct</title>
<style>
  :root { --albastru:#1a73e8; --inchis:#0b3d91; --verde:#188038; --rosu:#c5221f; --gri:#5f6368; --linia:#dadce0; }
  * { box-sizing:border-box; }
  body { margin:0; font:15px/1.55 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif; color:#202124; background:#f8f9fa; }
  .pagina { max-width:1080px; margin:0 auto; padding:28px 20px 80px; }
  h1 { font-size:26px; margin:0 0 6px; }
  .sub { color:var(--gri); margin:0 0 22px; }
  h2 { font-size:19px; margin:34px 0 12px; padding-bottom:8px; border-bottom:2px solid var(--linia); }
  .banner { border-radius:10px; padding:14px 18px; margin:18px 0 8px; line-height:1.5; }
  .banner.rosu { background:#fce8e6; border-left:5px solid var(--rosu); }
  .banner.verde { background:#e6f4ea; border-left:5px solid var(--verde); }
  .rand { display:grid; grid-template-columns:230px 1fr; gap:14px; padding:9px 0; border-bottom:1px solid var(--linia); }
  .eticheta { font-weight:600; color:var(--gri); }
  .valoare { word-break:break-word; }
  .bloсaj, .blocaj { color:var(--rosu); }
  code { background:#f1f3f4; padding:1px 6px; border-radius:4px; font-size:13px; }
  pre { background:#f1f3f4; border-left:4px solid var(--albastru); padding:14px 16px; border-radius:0 8px 8px 0;
        white-space:pre-wrap; word-break:break-word; font:13.5px/1.6 ui-monospace,Menlo,Consolas,monospace; margin:10px 0; }
  .imagini { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:18px; margin-top:14px; }
  .tabel { background:#fff; border:1px solid var(--linia); border-radius:10px; padding:4px 16px; }
  .card { background:#fff; border:1px solid var(--linia); border-radius:10px; padding:12px; }
  .card img { width:100%; display:block; border-radius:6px; }
  .card .nume { font:12px/1.4 ui-monospace,Menlo,Consolas,monospace; color:var(--gri); margin-top:8px; }
  .card .dim { font-weight:600; margin-top:4px; }
  .pas { color:var(--gri); font-size:13.5px; margin:-4px 0 12px; }
  .numar { display:inline-block; width:22px; height:22px; border-radius:50%%; background:var(--albastru); color:#fff;
           text-align:center; font-weight:700; font-size:13px; margin-right:7px; }
</style>
</head>
<body>
<div class="pagina">
  <h1>Cheie de configurare — pagina Facebook „AutoAct · pachet acte auto"</h1>
  <p class="sub">Generată automat din <code>site/config.js</code> și <code>brand/</code>. Nu edita această pagină: rulează <code>node brand/facebook/cheie-de-configurare.js</code>.</p>
  ${ATENTIE}
  ${PLACEHOLDER_LEGAL ? `
    <div class="banner rosu">
      <strong>Paginile /termeni și /gdpr nu pot încă fi publicate.</strong>
      Blocul <code>LEGAL</code> din <code>site/config.js</code> e necompletat
      (<code>${LEGAL.INSTANTE}</code>). Meta cere ca o Pagină care colectează date să aibă
      termeni și o politică de confidențialitate funcționale — de aceea
      <code>deploy-autoact.sh</code> se oprește înainte de server.
    </div>` : ''}

  <h2>1 · Crearea paginii</h2>
  <div class="rand"><div class="eticheta">Tip cont</div><div class="valoare"><strong>Pagină de afaceri</strong> — nu profil personal</div></div>
  <div class="rand"><div class="eticheta">Nume</div><div class="valoare">AutoAct · pachet acte auto</div></div>
  <div class="rand"><div class="eticheta">Nume utilizator</div><div class="valoare">@autoact</div></div>
  <div class="rand"><div class="eticheta">Categorie</div><div class="valoare">Servicii auto</div></div>

  <h2>2 · Bio <span style="font-weight:400;color:#5f6368">(${BIO.length} din 255 de caractere)</span></h2>
  <pre>${BIO}</pre>

  <h2>3 · Descriere</h2>
  <pre>${DESCRIERE}</pre>

  <h2>4 · Materialele grafice</h2>
  <p class="pas">Se încarcă din <code>brand/png/</code>. Fiecare imagine e generată, nu desenată — nu edita niciodată un PNG.</p>
  <div class="imagini">
    ${IMAGINI.map((i) => `    <div class="card">
      <img src="${i.dataUri}" alt="${i.camp}">
      <div class="dim">${i.lat}×${i.inalt}</div>
      <div class="nume">${i.camp}<br>${i.fisier}</div>
    </div>`).join('\n')}
  </div>

  <h2>5 · Date de contact — doar după ce NAP-ul e complet</h2>
  <p class="pas">Aceste câmpuri sunt <strong>ultimele</strong> pe care le completezi, nu primele.
  Până când NAP-ul nu e completat în <code>site/config.js</code>, fiecare valoare de mai jos
  e fictivă și nu trebuie copiată în pagină.</p>
  <div class="tabel">
${campNap('Adresă', NAP.ADRESA, PLACEHOLDER_NAP ? 'adresa din config.js e încă fictivă' : '')}
${campNap('Telefon', NAP.TELEFON, PLACEHOLDER_NAP ? 'numărul din config.js e încă fictiv' : '')}
${campNap('E-mail', NAP.EMAIL, PLACEHOLDER_NAP ? 'e-mailul din config.js e încă fictiv' : '')}
${campNap('CIF', NAP.CIF, PLACEHOLDER_NAP ? 'CIF fictiv — nu apare în pagină, dar nici el nu e real încă' : '')}
${campNap('Reg. Com.', NAP.REG_COM, PLACEHOLDER_NAP ? 'număr fictiv' : '')}
${campNap('Program', 'Răspundem în zilele lucrătoare, 09:00–18:00', '')}
${campNap('Preț afișat', '$$', '')}
  </div>

  <h2>6 · Butoane de acțiune</h2>
  <div class="rand"><div class="eticheta">Adaugă acum</div><div class="valoare"><strong>Trimite mesaj</strong></div></div>
  <div class="rand"><div class="eticheta">Adaugă <strong>numai</strong> după Stripe live</div><div class="valoare">Cumpără acum → Payment Link-ul din <code>site/config.js</code>. Adăugat acum, ar duce clientul într-un flux de plată de test.</div></div>
  <div class="rand"><div class="eticheta">Adaugă după NAP complet</div><div class="valoare">Site web → ${NAP.SITE}</div></div>

  <h2>7 · Grupul — abia după ce pagina e salvată</h2>
  <div class="rand"><div class="eticheta">Tip</div><div class="valoare">Grup <strong>privat</strong></div></div>
  <div class="rand"><div class="eticheta">Nume</div><div class="valoare">AutoAct — clienți</div></div>
  <div class="rand"><div class="eticheta">Setări care contează</div><div class="valoare">Doar administratorii pot publica · membrii nu invită · admitere cu aprobare · sortare pe activitate recentă · notificări la fiecare postare</div></div>
  <p class="pas"><strong>Întrebările de filtrare sunt partea importantă.</strong> Cu ele intră doar cine chiar are o tranzacție; fără ele, grupul se umple de oameni care întreabă prețul — adică publicul care nu a plătit și nu are nevoie de ajutor.</p>
  <pre>1. Ai cumpărat deja pachetul AutoAct sau vrei să-l cumperi acum?
   → Da, l-am cumpărat deja · Vreau să cumpăr · Am auzit doar de AutoAct

2. Ce ai nevoie?
   → Completez formularul pentru DRPCIV
   → Nu știu cine e cumpărătorul (nu îl cunosc)
   → Am nevoie de acte pentru cumpărător din altă țară
   → Altceva

3. În ce etaj ești?
   → Am pozat actele, nu am plătit
   → Am plătit, aștept documentele
   → Am primit documentele, am o întrebare</pre>

  <h2>8 · Mesajul fixat în grup</h2>
  <pre>${MESAJ_FIXAT}</pre>

  <h2>9 · Regulile grupului</h2>
  <pre>${REGULI_GRUP}</pre>

  <h2>10 · Prima postare</h2>
  <p class="pas">Doar după ce pagina e completată și salvată.</p>
  <pre>${POSTARE_1}</pre>

  <h2>11 · Ordinea de configurare</h2>
  <div class="rand"><div class="eticheta"><span class="numar">1</span>Creează pagina</div><div class="valoare">Nume, categorie, handle</div></div>
  <div class="rand"><div class="eticheta"><span class="numar">2</span>Lipește bio-ul</div><div class="valoare">Secțiunea 2 de mai sus</div></div>
  <div class="rand"><div class="eticheta"><span class="numar">3</span>Lipește descrierea</div><div class="valoare">Secțiunea 3</div></div>
  <div class="rand"><div class="eticheta"><span class="numar">4</span>Încarcă imaginile</div><div class="valoare">Secțiunea 4 — profil și acoperire întâi</div></div>
  <div class="rand"><div class="eticheta"><span class="numar">5</span>Creează grupul</div><div class="valoare">Secțiunea 7 — cu întrebările de filtrare</div></div>
  <div class="rand"><div class="eticheta"><span class="numar">6</span>Publică prima postare</div><div class="valoare">Secțiunea 10</div></div>
  <div class="rand"><div class="eticheta"><span class="numar">7</span>Abia după NAP</div><div class="valoare">Secțiunea 5 — adresă, telefon, e-mail, linkuri</div></div>
  <div class="rand"><div class="eticheta"><span class="numar">8</span>Abia după Stripe live</div><div class="valoare">Butonul „Cumpără acum"</div></div>

  <h2>12 · Ce NU se face</h2>
  <div class="rand"><div class="eticheta">Reclame / boost</div><div class="valoare">Cardul vine doar pentru verificarea identității. Dacă în cont rămâne o reclamă activă, se oprește imediat.</div></div>
  <div class="rand"><div class="eticheta">Preț în numele paginii</div><div class="valoare">Se schimbă, iar Meta penalizează materialele care induc în răscumpărare.</div></div>
  <div class="rand"><div class="eticheta">Recenzii cumpărate</div><div class="valoare">Penalizarea se aplică contului, nu postării.</div></div>
  <div class="rand"><div class="eticheta">Consultanță fiscală în grup</div><div class="valoare">Orice răspuns despre taxe se încheie cu „scrie la ANAF".</div></div>

  <p class="sub" style="margin-top:40px">Prețul afișat mai sus (<strong>${PRET_AFISAT}</strong>) e citit din <code>site/config.js</code>. Nu edita cifrele aici — se schimbă într-un singur loc, iar această pagină se regenerează.</p>
</div>
</body>
</html>`;

const iesire = path.join(DIR, 'cheie-de-configurare.html');
fs.writeFileSync(iesire, html, 'utf8');
console.log('OK → ' + path.relative(process.cwd(), iesire) + ' (' + Math.round(html.length / 1024) + ' KB)\n');

/* ---------- Verificări ---------- */
check(BIO.length > 0 && BIO.length <= 255, 'bio-ul e preluat din pagina.md și încape în limita Meta (' + BIO.length + '/255)');
check(DESCRIERE.length > 0, 'descrierea e preluată din pagina.md (' + DESCRIERE.length + ' caractere)');
check(MESAJ_FIXAT.length > 0, 'mesajul fixat e preluat din grup-clienti.md');
check(REGULI_GRUP.length > 0, 'regulile grupului sunt preluate din grup-clienti.md');
check(POSTARE_1.length > 0, 'prima postare e preluată din copy-postari-lansare.md');

/* Bio-ul trebuie să conțină prețul din config — cheia nu e locul unde
 * prețul o ia în boacă. */
check(BIO.indexOf(PRET_RON + ' lei') >= 0 || BIO.indexOf(PRET_AFISAT) >= 0,
  'bio-ul conține prețul din config.js (' + PRET_AFISAT + ')');

/* Fiecare imagine încorporată trebuie să fie cea declarată. */
check(IMAGINI.length === 5, 'toate cele 5 imagini sunt încorporate — găsite: ' + IMAGINI.length);
for (const i of IMAGINI) {
  check(i.lat > 0 && i.inalt > 0 && i.dataUri.length > 1000,
    'imagine încorporată: ' + i.fisier + ' (' + i.lat + '×' + i.inalt + ')');
}

/* Dacă NAP-ul e placeholder, cheia trebuie să OARTE vizibil — altfel
 * cineva copiază CIF-ul fictiv în pagină fără să vadă avertismentul. */
check(!PLACEHOLDER_NAP || (html.indexOf('NU completa adresa') >= 0 && html.indexOf(NAP.CIF) >= 0),
  'cheia avertizează VIZIBIL că NAP-ul e placeholder și arată valoarea fictivă');
check(!PLACEHOLDER_NAP || html.indexOf('NU SALVA DEOCUM') >= 0,
  'valorile NAP-ului sunt marcate „NU SALVA DEOCUM", nu prezentate ca gata de folosit');
check(!PLACEHOLDER_LEGAL || html.indexOf('LEGAL') >= 0,
  'cheia amintește că blocajul LEGAL există');

/* Nicio cifră scrisă cu mâna în afară de prețul din config. Se verifică
 * doar TEXTUL: imaginile sunt încorporate ca data URI, iar base64-ul lor
 * conține orice combinație de cifre și litere — o verificare care scanează
 * tot fișierul găsește „6lei" într-un blob și dă un eșec care nu înseamnă
 * nimic, exact tipul de alarmă falsă care îți taie încrederea în test. */
const doarText = html.replace(/data:image\/png;base64,[A-Za-z0-9+/=]+/g, '');
const cifreManuale = [...doarText.matchAll(/(\d+)\s*lei/g)].filter((m) => m[1] !== String(PRET_RON));
check(cifreManuale.length === 0, 'niciun preț scris cu mâna în cheie — toate vin din config.js',
  cifreManuale.map((m) => m[0]).join(', '));

console.log('');
console.log('brand/facebook/cheie-de-configurare: ' + total + ' verificări · ' + esecuri + ' eșuate');
if (esecuri > 0) { console.error('Cheia nu e de încredere — nu te baza pe ea.'); process.exit(1); }
console.log('Toate valorile sunt pe loc, luate din cod. ✔');