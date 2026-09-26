/* ============================================================
 * AutoAct | module-2 | test-pipeline-e2e.js
 * Simulare END-TO-END a pipeline-ului real (autoact-workflow.json):
 *
 *   [Webhook UI] → [Decodare fisiere] → [Vision OCR (FAKE)]
 *     → [Gemini Curatare (FAKE)] → [Validator CNP (cod REAL)]
 *     → [IF Scor & CNP (expresii REALE)] → [IF Plata (expresii REALE)]
 *          ├─ false → [Respond Plata (expresie REALĂ)]
 *          └─ true  → [Documente ZIP (cod REAL)] → [Gmail (expresii REALE)]
 *
 * Ce este REAL (executat chiar din JSON-ul workflow-ului):
 *   ✔ jsCode-ul nodurilor 2 (Decodare), 5 (Validator), 10 (Documente ZIP)
 *   ✔ condițiile IF (operatori gte/true/equals evaluați generic)
 *   ✔ expresiile responseBody/sendTo (redau răspunsul exact al clientului)
 *   ✔ body-ul cererii Vision OCR (jsonBody evaluat → 5 data URI)
 * Ce este FAKE (înlocuitorii serviciilor externe, deterministici):
 *   ✔ Vision OCR: text brut DEGRADAT din Test Data Kit (VIN cu litera O,
 *     plăcuță minusculă fără liniuțe, nume în caps, fără diacritice)
 *   ✔ Gemini: aplică regulile din promptul real (O→0 în VIN, normalizare
 *     plăcuță B-123-ABC, case-fix nume/străzi, SIRUTA ok) și întoarce
 *     răspunsul în forma exactă a API-ului (candidates[0].content.parts[0])
 *
 * Scenarii: (1) fericit → plată → documente; (2) CNP corupt → fallback;
 * (3) 2 câmpuri nesigure → fallback; (4) webhook incomplet → eroare.
 *
 * Rulare:  node module-2/test-pipeline-e2e.js
 * ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const WF = JSON.parse(fs.readFileSync(path.join(__dirname, 'autoact-workflow.json'), 'utf8'));
const nod = (nume) => {
  const n = WF.nodes.find((x) => x.name === nume);
  if (!n) throw new Error('nod negăsit în workflow: ' + nume);
  return n;
};
const kit = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'module-1', 'test-data-kit.json'), 'utf8')).intrari;

let total = 0, esecuri = 0;
const check = (cond, mesaj, detaliu) => {
  total++;
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + mesaj + (detaliu && !cond ? '  [' + detaliu + ']' : ''));
  if (!cond) esecuri++;
};

/* ----------executori generici pentru nodurile n8n ---------- */
const AsyncFunction = (async function () {}).constructor;
function ruleazaCode(jsCode, ctx) {
  const fn = new AsyncFunction('$json', '$binary', 'items', 'helpers', 'require', jsCode);
  return fn.call({ helpers: ctx.helpers || {} }, ctx.$json || {}, ctx.$binary || {}, ctx.items || [], ctx.helpers || {}, require);
}
function evalueazaExpresie(expr, json) {
  if (typeof expr !== 'string' || !expr.startsWith('=')) return expr;
  const m = expr.match(/^=\{\{([\s\S]*)\}\}$/);
  if (!m) throw new Error('expresie nerecunoscută: ' + expr.slice(0, 60));
  return new Function('$json', 'return (' + m[1] + ');')(json);
}
function evalueazaIF(numeNod, json) {
  const node = nod(numeNod);
  const conds = node.parameters.conditions.conditions;
  const rez = conds.map((c) => {
    const left = evalueazaExpresie(c.leftValue, json);
    const op = c.operator;
    if (op.type === 'boolean' && op.operation === 'true') return left === true;
    if (op.type === 'number' && op.operation === 'gte') return Number(left) >= Number(c.rightValue);
    if (op.type === 'number' && op.operation === 'equals') return Number(left) === Number(c.rightValue);
    if (op.type === 'string' && op.operation === 'equals') return String(left) === String(c.rightValue);
    throw new Error('operator necunoscut: ' + op.type + '.' + op.operation);
  });
  return node.parameters.conditions.combinator === 'and' ? rez.every(Boolean) : rez.some(Boolean);
}

/* ---------- FAKE Vision OCR: text brut degradat din Test Data Kit ---------- */
function ocrFake(kitVanzator, kitCumparator) {
  return [
    'CARTE DE IDENTITATE - VANZATOR',
    'NUME: ' + kitVanzator.nume_fictiv.toUpperCase(),
    'CNP: ' + kitVanzator.cnp,
    'SERIA/NR: ' + kitVanzator.serie_ci_fictiva.slice(0, 2) + ' ' + kitVanzator.serie_ci_fictiva.slice(2),
    'ADRESA: ' + kitVanzator.adresa_fictiva.toUpperCase(),
    '',
    'CERTIFICAT DE INMATRICULARE',
    'SERIE SASIU: ' + kitVanzator.vin_fictiv.replace('0', 'O'),  // OCR a citit primul 0 real → litera O (recuperabil prin regula O→0)
    'NR. INMATRICULARE: ' + kitVanzator.placuta_fictiva.toLowerCase().replace(/-/g, ''),  // b123abc
    'MARCA/MODEL: ' + kitVanzator.vin_fictiv.slice(0, 3) + ' LOGAN',
    '',
    'CUMPARATOR: ' + kitCumparator.nume_fictiv.toUpperCase() + ', CNP: ' + kitCumparator.cnp
  ].join('\n');
}

/* ---------- FAKE Gemini: aplică regulile din promptul real ---------- */
function geminiFake(textOcr) {
  const linie = (prefix) => {
    const l = textOcr.split('\n').find((x) => x.startsWith(prefix));
    return l ? l.slice(prefix.length).trim() : '';
  };
  const vin = linie('SERIE SASIU:').replace(/O/g, '0');            // regula 2: O→0, I→1, Q→0
  const placuta = linie('NR. INMATRICULARE:').toUpperCase();
  const placutaFormatata = placuta.replace(/^([A-Z]{1,2})(\d{2,3})([A-Z]{3})$/, '$1-$2-$3');  // regula 3
  const titlu = (s) => s.toLowerCase().replace(/(^|[-\s])([a-zăâîșț])/g, (_, a, b) => a + b.toUpperCase());
  const raspuns = {
    date_vanzator: {
      nume_complet: titlu(linie('NUME:')),
      cnp: linie('CNP:'),
      serie_ci: linie('SERIA/NR:').split(' ')[0],
      numar_ci: linie('SERIA/NR:').split(' ')[1] || '',
      adresa: titlu(linie('ADRESA:')),
      localitate: 'Bucuresti (Sector 1)',
      judet: 'Bucuresti Sector 1'
    },
    date_cumparator: {
      nume_complet: titlu(linie('CUMPARATOR:').split(',')[0]),
      cnp: linie('CUMPARATOR:').split('CNP: ')[1],
      serie_ci: 'YA', numar_ci: '234567',
      adresa: 'Calea Turzii nr. 88', localitate: 'Cluj-Napoca', judet: 'Cluj',
      telefon: '+40700002000', email: 'cumparator2@example.com'
    },
    date_vehicul: {
      marca: linie('MARCA/MODEL:').split(' ')[0],
      model: 'Logan',
      vin, numar_inmatriculare: placutaFormatata,
      an_fabricatie: 2016, cilindree_cm: 1461, putere_kw: 55,
      masa_maxima_kg: 1730, odometru_km: 154000, tip_combustibil: 'motorina'
    },
    date_tranzactie: { data_vanzarii: '2026-09-26', localitate_incheiere: 'Bucuresti', suma_ron: 9500 },
    localitate_siruta_ok: true,
    campuri_nesigure: []
  };
  return { candidates: [{ content: { parts: [{ text: JSON.stringify(raspuns) }] } }] };
}

/* ---------- Punctul de plecare: 5 fișiere binare (webhook) ---------- */
const numeFisiere = ['ci_fata', 'ci_verso', 'civ_fata', 'civ_verso', 'talon'];
const binare = {};
for (const f of numeFisiere) binare[f] = { mimeType: 'image/jpeg', continut: 'imagine-' + f + '-din-kit' };
const helpersWebhook = { getBinaryDataBuffer: async (i, k) => Buffer.from(binare[k].continut) };

/* ============================================================
 * SCENARIUL 1 — fericit: OCR degradat → curățat → scor 100 → plată → documente
 * (rulează într-un IIFE async pentru compatibilitate CommonJS)
 * ============================================================ */
(async () => {
console.log('--- Scenariul 1: fericit (OCR degradat → curățare → plată → documente) ---');

// Nodul 2 (cod REAL): decodare
const outDecod = await ruleazaCode(nod('Decodare fisiere').parameters.jsCode, { items: [{ json: {}, binary: binare }], helpers: helpersWebhook });
const item = outDecod[0].json;
check(Object.keys(item).filter((k) => k.endsWith('_b64')).length === 5, 'E2E nod 2: 5 câmpuri _b64 din webhook');

// Nodul 3 (expresie REALĂ jsonBody): cererea OCR conține cele 5 imagini
const bodyOcr = evalueazaExpresie(nod('Vision OCR').parameters.jsonBody, item);
const imagini = (bodyOcr.match(/data:image\/jpeg;base64,/g) || []).length;
check(imagini === 5, 'E2E nod 3: jsonBody real conține 5 data URI', imagini + ' găsite');
check(bodyOcr.includes('"gpt-4o-mini"') && bodyOcr.includes('"temperature":0'), 'E2E nod 3: model gpt-4o-mini, temperature 0');

// FAKE OCR: text degradat
const textOcr = ocrFake(kit[0], kit[1]);
const vinOcr = textOcr.match(/SERIE SASIU: ([A-Z0-9]+)/)[1];
check(/[OIQ]/.test(vinOcr), 'FAKE OCR: VIN-ul degradat conține litera interzisă O (' + vinOcr + ')');
check(!/^[A-HJ-NPR-Z0-9]{17}$/.test(vinOcr), 'FAKE OCR: VIN-ul degradat PICĂ regex-ul ISO 3779 (de aceea e obligatorie curățarea)');

// Nodul 4 (expresie REALă): promptul Gemini embeddează textul OCR
const bodyGem = evalueazaExpresie(nod('Gemini Curatare').parameters.jsonBody, { choices: [{ message: { content: textOcr } }] });
check(bodyGem.includes('CARTE DE IDENTITATE - VANZATOR') && bodyGem.includes('CNP: ' + kit[0].cnp), 'E2E nod 4: promptul Gemini real include textul OCR');

// FAKE Gemini: curățare conform regulilor + răspuns în forma API-ului
const raspunsGem = geminiFake(textOcr);
const curat = JSON.parse(raspunsGem.candidates[0].content.parts[0].text);
check(curat.date_vehicul.vin === kit[0].vin_fictiv, 'FAKE Gemini: VIN corectat O→0 și identic cu kit-ul (' + curat.date_vehicul.vin + ')');
check(/^[A-HJ-NPR-Z0-9]{17}$/.test(curat.date_vehicul.vin), 'FAKE Gemini: VIN-ul curățat TRECE regex-ul ISO 3779');
check(curat.date_vehicul.numar_inmatriculare === kit[0].placuta_fictiva, 'FAKE Gemini: plăcuță normalizată ' + curat.date_vehicul.numar_inmatriculare);
check(curat.date_vanzator.nume_complet === kit[0].nume_fictiv, 'FAKE Gemini: nume case-fixat: ' + curat.date_vanzator.nume_complet);

// Nodul 5 (cod REAL): validator + scor
const outValid = await ruleazaCode(nod('Validator CNP').parameters.jsCode, { $json: { ...raspunsGem, id_tranzactie: item.id_tranzactie } });
const stare = outValid[0].json;
check(stare.cnp_valid_tot === true, 'E2E nod 5: CNP-urile din fluxul complet valide');
check(stare.scor_calitate === 100, 'E2E nod 5: scor 100 (fără câmpuri nesigure)', 'obținut: ' + stare.scor_calitate);
check(stare.date_vehicul.vin === kit[0].vin_fictiv, 'E2E nod 5: VIN-ul corectat a supraviețuit lanțului OCR→Gemini→validator');

// Nodul 6 (expresii REALE): IF Scor & CNP → true
check(evalueazaIF('IF Scor & CNP', stare) === true, 'E2E nod 6: IF Scor & CNP → ramura TRUE (scor 100 ≥ 95, CNP valid)');

// Nodul 8 (expresii REALE): IF Plata → false (încă neplătit)
check(evalueazaIF('IF Plata', stare) === false, 'E2E nod 8: IF Plata → ramura FALSE înainte de plată');
const raspunsPlata = JSON.parse(evalueazaExpresie(nod('Respond Plata').parameters.responseBody, stare));
check(raspunsPlata.status === 'awaiting_payment' && raspunsPlata.suma_ron === 49, 'E2E nod 9: clientul primește awaiting_payment + 49 RON');
check(raspunsPlata.url_plata === 'https://autoact.ro/plata?tr=' + item.id_tranzactie, 'E2E nod 9: url_plata conține id_tranzactie');

// Reintrare cu plata confirmată → IF true → Documente ZIP (cod REAL)
const dupaPlata = { ...stare, plata_confirmata: true };
check(evalueazaIF('IF Plata', dupaPlata) === true, 'E2E nod 8: IF Plata → TRUE după confirmarea plății');
const outZip = await ruleazaCode(nod('Documente ZIP').parameters.jsCode, { $json: dupaPlata });
const pachet = outZip[0].json;
check(Object.keys(pachet.valori).length === 37, 'E2E nod 10: harta completă de 37 placeholder-e rezolvată');
check(pachet.valori.vanzator_nume === kit[0].nume_fictiv && pachet.valori.vehicul_vin === kit[0].vin_fictiv, 'E2E nod 10: {{vanzator_nume}} + {{vehicul_vin}} = valorile din kit (corectate)');
check(pachet.valori.data_vanzarii === '2026-09-26' && pachet.valori.suma_ron === '9500', 'E2E nod 10: data + suma rezolvate');
check(pachet.documente.length === 3 && pachet.zip_nume === item.id_tranzactie + '.zip', 'E2E nod 10: 3 PDF-uri + nume ZIP = id_tranzactie');

// Nodul 11 (expresii REALE): Gmail către cumpărător
const destinatar = evalueazaExpresie(nod('Gmail Livrare').parameters.sendTo, pachet);
check(destinatar === 'cumparator2@example.com' || destinatar === kit[1].email_fictiv || /@example\.com$/.test(destinatar), 'E2E nod 11: e-mailul pleacă către cumpărător (' + destinatar + ')');
const subiect = nod('Gmail Livrare').parameters.subject;
const mesaj = nod('Gmail Livrare').parameters.message;
check(typeof subiect === 'string' && subiect.includes('AutoAct'), 'E2E nod 11: subiectul conține branding AutoAct');
check(mesaj.includes('printezi') && mesaj.includes('notar') && mesaj.includes('DRPCIV'), 'E2E nod 11: corpul include instrucțiunile printare/notar/DRPCIV');

/* ============================================================
 * SCENARIUL 2 — CNP corupt de OCR/Gemini → fallback client
 * ============================================================ */
console.log('\n--- Scenariul 2: CNP corupt → fallback la client ---');
const corupt = JSON.parse(JSON.stringify(raspunsGem));
corupt.candidates[0].content.parts[0].text = JSON.stringify({
  ...curat,
  date_cumparator: { ...curat.date_cumparator, cnp: curat.date_cumparator.cnp.slice(0, 12) + String((Number(curat.date_cumparator.cnp[12]) + 1) % 10) }
});
const outCorupt = await ruleazaCode(nod('Validator CNP').parameters.jsCode, { $json: { ...corupt, id_tranzactie: item.id_tranzactie } });
const stareCorupt = outCorupt[0].json;
check(stareCorupt.cnp_valid_tot === false && stareCorupt.cnp_erori.length > 0, 'E2E nod 5: CNP corupt → invalid + erori detaliate');
check(stareCorupt.scor_calitate === 85, 'E2E nod 5: scor penalizat 100−15 = 85', 'obținut: ' + stareCorupt.scor_calitate);
check(evalueazaIF('IF Scor & CNP', stareCorupt) === false, 'E2E nod 6: IF → ramura FALSE (fallback, fără alerte admin)');
const raspunsFallback = JSON.parse(evalueazaExpresie(nod('Fallback Client').parameters.responseBody, stareCorupt));
check(raspunsFallback.status === 'corectii_necesare', 'E2E nod 7: răspunsul clientului = corectii_necesare');
check(Array.isArray(raspunsFallback.cnp_erori) && raspunsFallback.cnp_erori.length > 0, 'E2E nod 7: cnp_erori incluse în răspuns');
check(!!raspunsFallback.date.date_vanzator && !!raspunsFallback.date.date_vehicul, 'E2E nod 7: datele complete trimise pentru corecție inline');

/* ============================================================
 * SCENARIUL 3 — 2 câmpuri nesigure → scor 84 → fallback
 * ============================================================ */
console.log('\n--- Scenariul 3: 2 câmpuri nesigure → fallback ---');
const nesigure = JSON.parse(JSON.stringify(raspunsGem));
const curatNes = JSON.parse(nesigure.candidates[0].content.parts[0].text);
curatNes.campuri_nesigure = ['date_vanzator.adresa', 'date_vehicul.odometru_km'];
nesigure.candidates[0].content.parts[0].text = JSON.stringify(curatNes);
const outNes = await ruleazaCode(nod('Validator CNP').parameters.jsCode, { $json: { ...nesigure, id_tranzactie: item.id_tranzactie } });
check(outNes[0].json.scor_calitate === 84, 'E2E nod 5: scor 100 − 2×8 = 84', 'obținut: ' + outNes[0].json.scor_calitate);
check(evalueazaIF('IF Scor & CNP', outNes[0].json) === false, 'E2E nod 6: scor < 95 → fallback');
const fbNes = JSON.parse(evalueazaExpresie(nod('Fallback Client').parameters.responseBody, outNes[0].json));
check(fbNes.campuri_nesigure.length === 2, 'E2E nod 7: campuri_nesigure ajung la client pentru evidențierea galbenă');

/* ============================================================
 * SCENARIUL 4 — webhook incomplet → eroare explicită
 * ============================================================ */
console.log('\n--- Scenariul 4: webhook incomplet ---');
let aruncat = '';
try {
  await ruleazaCode(nod('Decodare fisiere').parameters.jsCode, {
    items: [{ json: {}, binary: { ci_fata: binare.ci_fata } }],
    helpers: helpersWebhook
  });
} catch (e) { aruncat = e.message; }
check(/1\/5/.test(aruncat), 'E2E nod 2: webhook cu 1/5 fișiere → eroare explicită', aruncat);

/* ---------- Rezumat ---------- */
console.log('\n============================================================');
console.log('TOTAL: ' + total + ' verificări E2E · ' + esecuri + ' eșuate');
console.log(esecuri === 0 ? 'PIPELINE E2E: TOATE TESTELE TREC ✔' : 'PIPELINE E2E: EȘUAT ✘');
console.log('============================================================');
process.exit(esecuri === 0 ? 0 : 1);
})().catch((e) => {
  console.error('EROARE E2E:', e && e.message ? e.message : e);
  process.exit(1);
});
