/* ============================================================
 * AutoAct | Modulul 2 | build-workflow.js
 * Generează module-2/autoact-workflow.json — JSON-ul n8n complet
 * cu cele 11 noduri din BLUEPRINT.md §2, importabil prin
 * n8n → ⋯ → Import from File (nu prin Copy-Paste).
 *
 * Rulare:  node module-2/build-workflow.js
 * Output:  module-2/autoact-workflow.json + 3 auto-validări:
 *   (a) parse JSON, (b) graf conex (11/11), (c) simularea
 *   nodurilor 2 (decodare base64) și 5 (validare CNP).
 * ============================================================ */
'use strict';

/* Prețul vine din SURSĂ (site/config.js): suma încasată în EUR și valoarea
 * contractuală în lei. Niciuna nu e scrisă manual aici. */
const { PRET_RON, PRET_EUR } = require('../config-autoact.js');

/* ---------- Helper: numele valide de parametri n8n ---------- */
function p(name) { return '=' + name; }

/* ---------- Nodul 5: validatorul CNP (mustarul din cnp-validator.code-node.js) ---------- */
const VALIDATOR_BODY = `
function valideazaCNP(cnp) {
  const out = { cnp: String(cnp == null ? '' : cnp), isValid: false, erori: [], meta: null };
  if (!/^[0-9]{13}$/.test(out.cnp)) {
    out.erori.push('CNP invalid: trebuie sa fie un string de exact 13 cifre.');
    return out;
  }
  const cifre = out.cnp.split('').map(Number);
  const S = cifre[0];
  const an = (S === 1 || S === 2 ? 1900 : (S === 3 || S === 4 ? 1800 : 2000)) + parseInt(out.cnp.slice(1, 3), 10);
  const luna = parseInt(out.cnp.slice(3, 5), 10);
  const zi = parseInt(out.cnp.slice(5, 7), 10);
  const judet = parseInt(out.cnp.slice(7, 9), 10);
  if (S < 1 || S > 6) out.erori.push('Prima cifra (S) este in afara intervalului 1-6.');
  const d = new Date(an, luna - 1, zi);
  const dataReal = d.getFullYear() === an && d.getMonth() === luna - 1 && d.getDate() === zi;
  if (!dataReal) out.erori.push('Data de nastere (AA/LL/ZZ) nu exista in calendar.');
  if (judet < 1 || judet > 52) out.erori.push('Codul de judet (JJ) trebuie sa fie 01-52.');
  if (out.erori.length > 0) return out;
  const CHEIE = '279146358279'.split('').map(Number);
  let suma = 0;
  for (let i = 0; i < 12; i++) suma += cifre[i] * CHEIE[i];
  const rest = suma % 11;
  const cifraControl = rest === 10 ? 1 : rest;
  if (cifraControl !== cifre[12]) {
    out.erori.push('Cifra de control incorecta (pozitia 13). Asteptat: ' + cifraControl + '.');
    return out;
  }
  out.isValid = true;
  out.meta = { sex: S % 2 === 1 ? 'masculin' : 'feminin', an_nastere: an, luna_nastere: luna, zi_nastere: zi, judet_nastere: judet };
  return out;
}
`;

/* ---------- Nodul 2: decodarea base64 a celor 5 fișiere webhooks ---------- */
const DECODER_BODY = `
// Input: nodul Webhook (5 fișiere binare: ci_fata, ci_verso, civ_fata, civ_verso, talon)
// Output: un singur item cu cele 5 perechi {cheie_b64, cheie_mime}
const CAMPURI = ['ci_fata', 'ci_verso', 'civ_fata', 'civ_verso', 'talon'];
let hex = '';
for (let i = 0; i < 16; i++) hex += '0123456789abcdef'[Math.floor(Math.random() * 16)];
const out = { id_tranzactie: 'tr_' + hex };
// Accesul corect la binare în nodul Code (Run Once for All Items): items[0].binary
const binar = (items[0] && items[0].binary) || {};
let gasite = 0;
for (const camp of CAMPURI) {
  if (!binar[camp]) continue;
  const buffer = await this.helpers.getBinaryDataBuffer(0, camp);
  if (!buffer || buffer.length === 0) continue;
  out[camp + '_b64'] = buffer.toString('base64');
  out[camp + '_mime'] = (binar[camp] && binar[camp].mimeType) || 'image/jpeg';
  gasite++;
}
if (gasite < 5) {
  throw new Error('Webhook incomplet: ' + gasite + '/5 fisiere primite (aștept: ci_fata, ci_verso, civ_fata, civ_verso, talon).');
}
return [{ json: out }];
`;

/* ---------- Definiția celor 11 noduri ---------- */
const nodes = [
  {
    id: 'a1f0c000-0000-4000-8000-000000000001',
    name: 'Webhook UI',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    position: [-140, 300],
    parameters: {
      httpMethod: 'POST',
      path: 'test-ui',
      responseMode: 'responseNode',
      options: {
        allowedOrigins: '*',
        rawBody: false
      }
    },
    webhookId: 'autoact-test-ui'
  },
  {
    id: 'a1f0c000-0000-4000-8000-000000000002',
    name: 'Decodare fisiere',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [180, 300],
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: DECODER_BODY.trim() + '\n'
    }
  },
  {
    id: 'a1f0c000-0000-4000-8000-000000000003',
    name: 'Vision OCR',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [500, 300],
    parameters: {
      method: 'POST',
      url: 'https://api.openai.com/v1/chat/completions',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ JSON.stringify({ model: "gpt-4o-mini", max_tokens: 1800, temperature: 0, messages: [{ role: "user", content: [ { type: "text", text: "Extrage DOAR textul vizibil din documentele romanesti atasate (CI fata/verso, CIV, talon). Fara interpretare, fara comentarii, fara markdown. Reproduci exact cifrele si literele, inclusiv CNP-ul si seria, asa cum apar." }, { type: "image_url", image_url: { url: "data:" + $json.ci_fata_mime + ";base64," + $json.ci_fata_b64 } }, { type: "image_url", image_url: { url: "data:" + $json.ci_verso_mime + ";base64," + $json.ci_verso_b64 } }, { type: "image_url", image_url: { url: "data:" + $json.civ_fata_mime + ";base64," + $json.civ_fata_b64 } }, { type: "image_url", image_url: { url: "data:" + $json.civ_verso_mime + ";base64," + $json.civ_verso_b64 } }, { type: "image_url", image_url: { url: "data:" + $json.talon_mime + ";base64," + $json.talon_b64 } } ] }] }) }}',
      options: {
        timeout: 60000,
        response: { response: { neverError: false } }
      }
    },
    credentials: {
      httpHeaderAuth: { id: 'REPLACE_CRED_OPENAI', name: 'OpenAI Header Auth' }
    }
  },
  {
    id: 'a1f0c000-0000-4000-8000-000000000004',
    name: 'Gemini Curatare',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [820, 300],
    parameters: {
      method: 'POST',
      url: '={{ "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + $credentials.gemini_api_key }}',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ JSON.stringify({ system_instruction: { parts: [{ text: "Esti un motor de curatare a datelor extrase OCR din documente romanesti. Raspunzi EXCLUSIV cu JSON valid, fara markdown, fara explicatii." }] }, contents: [{ role: "user", parts: [{ text: "Text OCR brut:\n" + $json.choices[0].message.content + "\n\nSarcini:\n1) Repara diacriticele romanesti in nume, prenume, strazi, localitati (ex: \'Bucuresti\' -> \'București\', \'Cluj Napoca\' -> \'Cluj-Napoca\').\n2) VIN: are EXACT 17 caractere. Literele I, O, Q sunt INTERZISE in VIN (ISO 3779): daca OCR le-a citit, inlocuieste \'O\'->\'0\', \'Q\'->\'0\', \'I\'->\'1\'. Verifica lungimea 17.\n3) Numere de inmatriculare: normalizeaza la formatul RO (ex: \'b123abc\' -> \'B-123-ABC\').\n4) Localitati: valideaza contra listei SIRUTA; daca localitatea nu exista, pune campul \'localitate_siruta_ok\': false.\n5) Nu inventa date: campurile lipsa raman null.\n\nReturneaza EXCLUSIV acest JSON:\n{\\"date_vanzator\\":{\\"nume_complet\\":\\"\\",\\"cnp\\":\\"\\",\\"serie_ci\\":\\"\\",\\"numar_ci\\":\\"\\",\\"adresa\\":\\"\\",\\"localitate\\":\\"\\",\\"judet\\":\\"\\"},\\"date_cumparator\\":{...aceleasi campuri...},\\"date_vehicul\\":{\\"marca\\":\\"\\",\\"model\\":\\"\\",\\"vin\\":\\"\\",\\"numar_inmatriculare\\":\\"\\",\\"an_fabricatie\\":null,\\"cilindree_cm\\":null,\\"putere_kw\\":null,\\"masa_maxima_kg\\":null,\\"odometru_km\\":null,\\"tip_combustibil\\":\\" \\"},\\"date_tranzactie\\":{\\"data_vanzarii\\":\\"\\",\\"localitate_incheiere\\":\\"\\"},\\"localitate_siruta_ok\\":true,\\"campuri_nesigure\\":[\\"lista campuri cu incredere scazuta\\"]}" }] }] }) }}',
      options: {
        timeout: 60000,
        response: { response: { neverError: false } }
      }
    }
  }
];

/* ---------- Nodurile 5–11 (Validator, IF-uri, Respond, ZIP, Gmail) ---------- */
nodes.push(
  {
    id: 'a1f0c000-0000-4000-8000-000000000005',
    name: 'Validator CNP',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1140, 300],
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: (VALIDATOR_BODY + `
// Input: iesirea Gemini Curatare (candidates[0].content.parts[0].text = JSON string)
const brut = $json.candidates && $json.candidates[0] && $json.candidates[0].content &&
  $json.candidates[0].content.parts && $json.candidates[0].content.parts[0].text;
if (!brut) throw new Error('Gemini nu a returnat continut parsabil.');
let date;
try {
  date = JSON.parse(String(brut).replace(/^\`\`\`(json)?/, '').replace(/\`\`\`$/, '').trim());
} catch (e) {
  throw new Error('Gemini nu a returnat JSON valid: ' + e.message);
}
const v1 = valideazaCNP((date.date_vanzator || {}).cnp);
const v2 = valideazaCNP((date.date_cumparator || {}).cnp);
const cnp_valid_tot = v1.isValid && v2.isValid;
const nesigure = Array.isArray(date.campuri_nesigure) ? date.campuri_nesigure.length : 0;
const scor_calitate = Math.max(0, 100 - nesigure * 8 - (cnp_valid_tot ? 0 : 15));
return [{ json: { ...date, id_tranzactie: $json.id_tranzactie, cnp_valid_tot, cnp_erori: v1.erori.concat(v2.erori), scor_calitate } }];
`).trim() + '\n'
    }
  },
  {
    id: 'a1f0c000-0000-4000-8000-000000000006',
    name: 'IF Scor & CNP',
    type: 'n8n-nodes-base.if',
    typeVersion: 2,
    position: [1460, 300],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        combinator: 'and',
        conditions: [
          { id: 'c-scor', leftValue: '={{ $json.scor_calitate }}', rightValue: 95, operator: { type: 'number', operation: 'gte' } },
          { id: 'c-cnp', leftValue: '={{ $json.cnp_valid_tot }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }
        ]
      }
    }
  },
  {
    id: 'a1f0c000-0000-4000-8000-000000000007',
    name: 'Fallback Client',
    type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1.1,
    position: [1460, 520],
    parameters: {
      respondWith: 'json',
      responseBody: '={{ JSON.stringify({ status: "corectii_necesare", scor_calitate: $json.scor_calitate, cnp_valid_tot: $json.cnp_valid_tot, cnp_erori: $json.cnp_erori, campuri_nesigure: $json.campuri_nesigure, date: { date_vanzator: $json.date_vanzator, date_cumparator: $json.date_cumparator, date_vehicul: $json.date_vehicul, date_tranzactie: $json.date_tranzactie }, mesaj_client: "Unele date nu au trecut validarea. Corecteaza campurile evidențiate pe ecranul de pre-vizualizare si retrimite." }) }}',
      options: { responseCode: 200 }
    }
  },
  {
    id: 'a1f0c000-0000-4000-8000-000000000008',
    name: 'IF Plata',
    type: 'n8n-nodes-base.if',
    typeVersion: 2,
    position: [1740, 300],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        combinator: 'and',
        conditions: [
          { id: 'c-plata', leftValue: '={{ $json.plata_confirmata === true }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }
        ]
      }
    }
  },
  {
    id: 'a1f0c000-0000-4000-8000-000000000009',
    name: 'Respond Plata',
    type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1.1,
    position: [1740, 520],
    parameters: {
      respondWith: 'json',
      responseBody: '={{ JSON.stringify({ status: "awaiting_payment", suma: ' + PRET_EUR + ', moneda: "EUR", suma_ron: ' + PRET_RON + ', id_tranzactie: $json.id_tranzactie, url_plata: "https://autoact.eu/plata?tr=" + $json.id_tranzactie, mesaj: "Finalizeaza plata pentru a genera documentele." }) }}',
      options: { responseCode: 200 }
    }
  },
  {
    id: 'a1f0c000-0000-4000-8000-000000000010',
    name: 'Documente ZIP',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [2020, 300],
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `
// Generează harta de înlocuiri pentru Google Docs batchUpdate (Modulul 2.7).
// Harta canonică: module-2/sabloane/placeholders.json — verificată de
// module-2/verifica-sabloane.js contra Profilului de Tranzacție demo.
const date = $json;
const HARTA = {
  tranzactie_numar: 'id_tranzactie',
  data_vanzarii: 'date_tranzactie.data_vanzarii',
  localitate_incheiere: 'date_tranzactie.localitate_incheiere',
  suma_ron: 'date_tranzactie.suma_ron',
  scutire_sub_24_luni: 'date_tranzactie.scutire_taxa_sub_24_luni',
  vanzator_nume: 'date_vanzator.nume_complet',
  vanzator_cnp: 'date_vanzator.cnp',
  vanzator_serie_ci: 'date_vanzator.serie_ci',
  vanzator_numar_ci: 'date_vanzator.numar_ci',
  vanzator_adresa: 'date_vanzator.adresa',
  vanzator_localitate: 'date_vanzator.localitate',
  vanzator_judet: 'date_vanzator.judet',
  vanzator_telefon: 'date_vanzator.telefon',
  vanzator_email: 'date_vanzator.email',
  cumparator_nume: 'date_cumparator.nume_complet',
  cumparator_cnp: 'date_cumparator.cnp',
  cumparator_serie_ci: 'date_cumparator.serie_ci',
  cumparator_numar_ci: 'date_cumparator.numar_ci',
  cumparator_adresa: 'date_cumparator.adresa',
  cumparator_localitate: 'date_cumparator.localitate',
  cumparator_judet: 'date_cumparator.judet',
  cumparator_telefon: 'date_cumparator.telefon',
  cumparator_email: 'date_cumparator.email',
  vehicul_marca: 'date_vehicul.marca',
  vehicul_model: 'date_vehicul.model',
  vehicul_vin: 'date_vehicul.vin',
  vehicul_placuta: 'date_vehicul.numar_inmatriculare',
  vehicul_an_fabricatie: 'date_vehicul.an_fabricatie',
  vehicul_cilindree: 'date_vehicul.cilindree_cm',
  vehicul_putere_kw: 'date_vehicul.putere_kw',
  vehicul_masa_maxima: 'date_vehicul.masa_maxima_kg',
  vehicul_combustibil: 'date_vehicul.tip_combustibil',
  vehicul_odometru: 'date_vehicul.odometru_km',
  vehicul_civ_serie: 'date_vehicul.certificat_inmatriculare_serie',
  vehicul_an_prim_inmatriculare: 'date_vehicul.an_fabricatie',
  drpciv_judet: 'date_cumparator.judet',
  fisc_judet: 'date_cumparator.judet'
};
const obtine = (cale) => cale.split('.').reduce((o, k) => (o == null ? undefined : o[k]), date);
const valori = {};
for (const [ph, cale] of Object.entries(HARTA)) {
  const v = obtine(cale);
  valori[ph] = (v === undefined || v === null) ? '' : String(v);
}
return [{ json: {
  id_tranzactie: date.id_tranzactie,
  documente: ['01-contract-vanzare-cumparare.pdf', '02-cerere-drpciv.pdf', '03-declaratii-fiscale.pdf'],
  valori,
  zip_nume: date.id_tranzactie + '.zip',
  destinatar: date.date_cumparator.email,
  nume_client: date.date_cumparator.nume_complet
} }];
`.trim() + '\n'
    }
  },
  {
    id: 'a1f0c000-0000-4000-8000-000000000011',
    name: 'Gmail Livrare',
    type: 'n8n-nodes-base.gmail',
    typeVersion: 2.1,
    position: [2300, 300],
    parameters: {
      sendTo: '={{ $json.destinatar }}',
      subject: 'AutoAct — actele tale pentru transcriere auto sunt gata (ZIP + factură)',
      emailType: 'html',
      message: '=<p>Bună, {{ $json.nume_client }},</p><p>Pachetul tău de acte pentru transcrierea auto este gata și îl găsești atașat (ZIP + factură).</p><h3>Ce faci după ce printezi actele</h3><ol><li>Printează PDF-urile din arhivă.</li><li>Mergi ÎNTÂI la notar cu mașina și actele originale pentru autentificarea contractului.</li><li>Semnați amândoi în fața notarului.</li><li>Mergi la DRPCIV cu contractul autentificat, CI, CIV original și dovada plății taxei de transcriere.</li><li>Primești noua înmatriculare.</li></ol><p>Verifică toate datele înainte de printare — actele se emit exact cu datele confirmate de tine la pasul de verificare.</p><p>Cu stimă,<br><strong>Echipa AutoAct</strong><br>autoact.eu</p>',
      options: { appendAttribution: false }
    }
  }
);

/* ---------- Reparație Gemini: URL fix + Query Auth + jsonBody construit programatic ----------
 * jsonBody-ul nu se scrie manual (riscul de escaping în expresia JS e real — prins de testul E2E):
 * builder-ul îl compune din string-uri normalizate, garantat sintactic valide.
 */
const gem = nodes.find((n) => n.name === 'Gemini Curatare');
gem.parameters.url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
gem.parameters.authentication = 'genericCredentialType';
gem.parameters.genericAuthType = 'httpQueryAuth';
const GEM_SISTEM = 'Esti un motor de curatare a datelor extrase OCR din documente romanesti. Raspunzi EXCLUSIV cu JSON valid, fara markdown, fara explicatii.';
const GEM_INAINTE = 'Text OCR brut:\n';
const GEM_DUPA = [
  '',
  'Sarcini:',
  "1) Repara diacriticele romanesti in nume, prenume, strazi, localitati (ex: 'Bucuresti' -> 'București', 'Cluj Napoca' -> 'Cluj-Napoca').",
  "2) VIN: are EXACT 17 caractere. Literele I, O, Q sunt INTERZISE in VIN (ISO 3779): daca OCR le-a citit, inlocuieste 'O'->'0', 'Q'->'0', 'I'->'1'. Verifica lungimea 17.",
  "3) Numere de inmatriculare: normalizeaza la formatul RO (ex: 'b123abc' -> 'B-123-ABC').",
  "4) Localitati: valideaza contra listei SIRUTA; daca localitatea nu exista, pune campul 'localitate_siruta_ok': false.",
  '5) Nu inventa date: campurile lipsa raman null.',
  '',
  'Returneaza EXCLUSIV acest JSON:',
  '{"date_vanzator":{"nume_complet":"","cnp":"","serie_ci":"","numar_ci":"","adresa":"","localitate":"","judet":""},"date_cumparator":{...aceleasi campuri...},"date_vehicul":{"marca":"","model":"","vin":"","numar_inmatriculare":"","an_fabricatie":null,"cilindree_cm":null,"putere_kw":null,"masa_maxima_kg":null,"odometru_km":null,"tip_combustibil":""},"date_tranzactie":{"data_vanzarii":"","localitate_incheiere":""},"localitate_siruta_ok":true,"campuri_nesigure":["lista campuri cu incredere scazuta"]}'
].join('\n');
gem.parameters.jsonBody =
  '={{ JSON.stringify({ system_instruction: { parts: [{ text: ' + JSON.stringify(GEM_SISTEM) +
  ' }] }, contents: [{ role: "user", parts: [{ text: ' + JSON.stringify(GEM_INAINTE) +
  ' + $json.choices[0].message.content + ' + JSON.stringify(GEM_DUPA) + ' }] }] }) }}';
const vis = nodes.find((n) => n.name === 'Vision OCR');
delete vis.credentials;

/* ---------- Sticky notes (instrucțiuni de instalare) ---------- */
nodes.push(
  {
    id: 'a1f0c000-0000-4000-8000-0000000000a1',
    name: 'Sticky - Instalare',
    type: 'n8n-nodes-base.stickyNote',
    typeVersion: 1,
    position: [-200, -80],
    parameters: {
      width: 520, height: 260, color: 4,
      content: '## INSTALARE — AutoAct Pipeline v1\n1) n8n → ⋯ → **Import from File** → acest JSON.\n2) Creează și atribuie credentials: **OpenAI** (Header Auth, `Authorization: Bearer sk-...`) la *Vision OCR*; **Gemini** (Query Auth: name=`key`, value=`AIza...`) la *Gemini Curatare*; **Gmail OAuth2** la *Gmail Livrare*.\n3) Activează workflow-ul → Production URL: `https://domeniul.ro/webhook/test-ui`. Adaugă la *Webhook UI* Authentication = Header Auth (`X-AutoAct-Key`).\n4) env (Modulul 3): `NODE_FUNCTION_ALLOW_BUILTIN=fs,path`'
    }
  },
  {
    id: 'a1f0c000-0000-4000-8000-0000000000a2',
    name: 'Sticky - Validator CNP',
    type: 'n8n-nodes-base.stickyNote',
    typeVersion: 1,
    position: [1000, 540],
    parameters: {
      width: 420, height: 180, color: 5,
      content: '### Validator CNP (nodul 5)\nCheia `279146358279` · rest % 11 · rest 10 → cifra 1.\nSursă: `module-2/cnp-validator.code-node.js` — testat 5/5 pe Test Data Kit.\nScor = 100 − 8 × campuri_nesigure − 15 dacă CNP invalid. Prag livrare: **≥ 95**.'
    }
  },
    {
    id: 'a1f0c000-0000-4000-8000-0000000000a3',
    name: 'Sticky - Ramura plata',
    type: 'n8n-nodes-base.stickyNote',
    typeVersion: 1,
    position: [1660, 540],
    parameters: {
      width: 460, height: 190, color: 6,
      content: '### Ramura PLATĂ\n*IF Plata* devine true doar când fluxul Netopia (webhook separat) reintră cu `plata_confirmata=true` + `id_tranzactie`. Până atunci clientul primește `url_plata`.\n*Documente ZIP*: MVP emite payload + lista PDF; integrarea Google Docs → PDF → zip-store conform BLUEPRINT.md §2.7. Atașează ZIP-ul nodului Gmail din /home/node/local/.'
    }
  }
);

/* ---------- Conexiuni ---------- */
const next = (name) => [{ node: name, type: 'main', index: 0 }];
const connections = {
  'Webhook UI':       { main: [next('Decodare fisiere')] },
  'Decodare fisiere': { main: [next('Vision OCR')] },
  'Vision OCR':       { main: [next('Gemini Curatare')] },
  'Gemini Curatare':  { main: [next('Validator CNP')] },
  'Validator CNP':    { main: [next('IF Scor & CNP')] },
  'IF Scor & CNP':    { main: [next('IF Plata'), next('Fallback Client')] },
  'IF Plata':         { main: [next('Documente ZIP'), next('Respond Plata')] },
  'Documente ZIP':    { main: [next('Gmail Livrare')] }
};

/* ---------- Asamblare + scriere ---------- */
const workflow = {
  name: 'AutoAct — Pipeline Acte Transcriere Auto (v1)',
  nodes,
  connections,
  active: false,
  settings: { executionOrder: 'v1' },
  pinData: {},
  meta: { instanceId: 'autoact-blueprint-v1' }
};

const fs2 = require('fs');
const path2 = require('path');
const OUT = path2.join(__dirname, 'autoact-workflow.json');
fs2.writeFileSync(OUT, JSON.stringify(workflow, null, 2) + '\n');

/* ================= AUTO-VALIDĂRI ================= */
let esecuri = 0;
const assert = (cond, mesaj) => {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + mesaj);
  if (!cond) esecuri++;
};

// Validările rulează într-un IIFE async pentru compatibilitate CommonJS
(async () => {
// (a) JSON re-parse
const citit = JSON.parse(fs2.readFileSync(OUT, 'utf8'));
assert(citit.nodes.length === 14, 'JSON valid cu 14 noduri (11 pipeline + 3 sticky) — găsite: ' + citit.nodes.length);

// (b) Graf conex: 10 muchii, toate țintele există, BFS de la Webhook
const numeSet = new Set(citit.nodes.map((n) => n.name));
let muchii = 0;
for (const [sursa, con] of Object.entries(citit.connections)) {
  if (!numeSet.has(sursa)) { assert(false, 'sursă inexistentă: ' + sursa); continue; }
  for (const ramura of con.main) for (const tinta of ramura) {
    muchii++;
    if (!numeSet.has(tinta.node)) assert(false, 'țintă inexistentă: ' + tinta.node);
  }
}
assert(muchii === 10, '10 muchii în graf — găsite: ' + muchii);
const adiacenta = {};
for (const [sursa, con] of Object.entries(citit.connections)) {
  adiacenta[sursa] = adiacenta[sursa] || [];
  for (const ramura of con.main) for (const tinta of ramura) adiacenta[sursa].push(tinta.node);
}
const vazute = new Set(['Webhook UI']);
const coada = ['Webhook UI'];
while (coada.length) {
  const curent = coada.shift();
  for (const urm of adiacenta[curent] || []) if (!vazute.has(urm)) { vazute.add(urm); coada.push(urm); }
}
const pipeline = citit.nodes.filter((n) => n.type !== 'n8n-nodes-base.stickyNote');
assert(vazute.size === pipeline.length, 'graf conex: ' + vazute.size + '/' + pipeline.length + ' noduri pipeline accesibile de la Webhook');

// (c) Simulare nod 2 (Decodare) — AsyncFunction + helpers fake
const AsyncFunction = (async function () {}).constructor;
function simuleaza(jsCode, ctx) {
  const fn = new AsyncFunction('$json', '$binary', 'items', 'helpers', jsCode);
  return fn.call({ helpers: ctx.helpers }, ctx.$json || {}, ctx.$binary || {}, ctx.items || [], ctx.helpers);
}
const nodDecod = citit.nodes.find((n) => n.name === 'Decodare fisiere');
const fisiereBinar = {};
for (const camp of ['ci_fata', 'ci_verso', 'civ_fata', 'civ_verso', 'talon']) fisiereBinar[camp] = { mimeType: 'image/jpeg' };
const helpersFake = { getBinaryDataBuffer: async (i, k) => Buffer.from('continut-' + k) };
const outDecod = await simuleaza(nodDecod.parameters.jsCode, {
  helpers: helpersFake,
  items: [{ json: {}, binary: fisiereBinar }]
});
assert(Object.keys(outDecod[0].json).filter((k) => k.endsWith('_b64')).length === 5, 'Decodare: 5 câmpuri _b64 generate');
assert(/^tr_[a-f0-9]{16}$/.test(outDecod[0].json.id_tranzactie), 'Decodare: id_tranzactie respectă pattern-ul schemei');
let aruncat = false;
try {
  await simuleaza(nodDecod.parameters.jsCode, {
    helpers: helpersFake,
    items: [{ json: {}, binary: { ci_fata: { mimeType: 'image/jpeg' } } }]
  });
} catch (e) { aruncat = true; }
assert(aruncat, 'Decodare: webhook incomplet (1/5 fișiere) → aruncă eroare');

// (d) Simulare nod 5 (Validator CNP) — cu CNP-urile reale din Test Data Kit
const kit = JSON.parse(fs2.readFileSync(path2.join(__dirname, '..', 'module-1', 'test-data-kit.json'), 'utf8')).intrari;
const exemplar = {
  date_vanzator: { nume_complet: kit[0].nume_fictiv, cnp: kit[0].cnp, serie_ci: 'RX', numar_ci: '123456', adresa: 'Str. Libertatii nr. 12', localitate: 'Bucuresti (Sector 1)', judet: 'Bucuresti Sector 1' },
  date_cumparator: { nume_complet: kit[1].nume_fictiv, cnp: kit[1].cnp, serie_ci: 'YA', numar_ci: '234567', adresa: 'Calea Turzii nr. 88', localitate: 'Cluj-Napoca', judet: 'Cluj' },
  date_vehicul: { marca: 'Dacia', model: 'Logan', vin: kit[0].vin_fictiv, numar_inmatriculare: 'B-123-ABC', an_fabricatie: 2016, cilindree_cm: 1461, putere_kw: 55, masa_maxima_kg: 1730, odometru_km: 154000, tip_combustibil: 'motorina' },
  date_tranzactie: { data_vanzarii: '2026-09-26', localitate_incheiere: 'Bucuresti', suma_ron: 9500 },
  localitate_siruta_ok: true,
  campuri_nesigure: ['date_vanzator.adresa']
};
const nodValid = citit.nodes.find((n) => n.name === 'Validator CNP');
const outValid = await simuleaza(nodValid.parameters.jsCode, {
  helpers: {}, items: [],
  $json: { id_tranzactie: 'tr_ab12cd34ef56ab12', candidates: [{ content: { parts: [{ text: JSON.stringify(exemplar) }] } }] }
});
assert(outValid[0].json.cnp_valid_tot === true, 'Validator: CNP-uri valide din Test Data Kit → cnp_valid_tot = true');
assert(outValid[0].json.scor_calitate === 92, 'Validator: scor = 100 - 8x1 nesigur = 92 — obținut: ' + outValid[0].json.scor_calitate);
const exemplarReau = JSON.parse(JSON.stringify(exemplar));
exemplarReau.date_cumparator.cnp = exemplarReau.date_cumparator.cnp.slice(0, 12) + String((Number(exemplarReau.date_cumparator.cnp[12]) + 1) % 10);
const outReu = await simuleaza(nodValid.parameters.jsCode, {
  helpers: {}, items: [],
  $json: { candidates: [{ content: { parts: [{ text: JSON.stringify(exemplarReau) }] } }] }
});
assert(outReu[0].json.cnp_valid_tot === false && outReu[0].json.cnp_erori.length > 0, 'Validator: CNP corupt → cnp_valid_tot = false + erori');
assert(outReu[0].json.scor_calitate === 77, 'Validator: scor penalizat = 77 — obținut: ' + outReu[0].json.scor_calitate);

// (e) Simulare nod 10 (Documente ZIP) — harta canonică de 37 placeholder-e rezolvată pe Test Data Kit
const nodZip = citit.nodes.find((n) => n.name === 'Documente ZIP');
const outZip = await simuleaza(nodZip.parameters.jsCode, {
  helpers: {}, items: [],
  $json: { ...exemplar, id_tranzactie: 'tr_ab12cd34ef56ab12' }
});
assert(Object.keys(outZip[0].json.valori).length === 37, 'Documente ZIP: harta completă de 37 placeholder-e — găsite: ' + Object.keys(outZip[0].json.valori).length);
assert(outZip[0].json.valori.vanzator_nume === kit[0].nume_fictiv, 'Documente ZIP: {{vanzator_nume}} rezolvat din Test Data Kit');
assert(outZip[0].json.valori.vehicul_vin === kit[0].vin_fictiv, 'Documente ZIP: {{vehicul_vin}} rezolvat');
assert(outZip[0].json.valori.suma_ron === '9500', 'Documente ZIP: {{suma_ron}} rezolvat');
assert(outZip[0].json.documente.length === 3, 'Documente ZIP: 3 documente în pachet');

console.log('\nOutput: ' + OUT);
console.log(esecuri === 0 ? 'TOATE VALIDĂRILE AU TRECUT ✔' : esecuri + ' VALIDĂRI EȘUATE ✘');
process.exit(esecuri === 0 ? 0 : 1);
})().catch((e) => {
  console.error('EROARE VALIDARE:', e && e.message ? e.message : e);
  process.exit(1);
});
