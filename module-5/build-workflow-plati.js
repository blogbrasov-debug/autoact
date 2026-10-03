/* ============================================================
 * AutoAct | Modulul 5 | build-workflow-plati.js
 * Generează module-5/autoact-workflow-plati.json — workflow-ul n8n
 * pentru plată + facturare + generare documente (BLUEPRINT.md §5.1),
 * importabil prin n8n → ⋯ → Import from File.
 *
 * 20 noduri pipeline:
 *   1  Webhook Netopia          (POST /webhook/netopia, responseNode)
 *   2  Parsare POST Netopia     (form-urlencoded → JSON)
 *   3  Decriptare Semnătură     (Code: RSA verify + AES-CBC, folosește crypto nativ)
 *   4  IF Semnătură Validă      (true/false)
 *   5  Respond Semnătură        (ramura false → cod 496, fără alerte)
 *   6  Idempotență (Postgres)   (CTE INSERT + UNION fallback — mereu exact 1 rând)
 *   7  IF Deja Procesată        (duplicat === 1 → true)
 *   8  Respond După             (ramura true → cod 200 „deja procesat")
 *   9  Data Tranzacție (PG)     (SELECT profil_json + coloane aplatizate)
 *  10  IF Plată Confirmată      (status === 'confirmed' && suma === PREȚ)
 *  11  Respond Respins          (ramura false → cod 200 + status respins)
 *  12  Payload SmartBill        (Code: construiește factura din rândul tranzacției)
 *  13  SmartBill Factură        (HTTP POST Basic Auth → e-Factura automată)
 *  14  Placeholder-e Docs       (Code: 37 înlocuiri × 3 documente din profil_json)
 *  15  Copie Template (Drive)   (POST files/{id}/copy — template-ul NU se modifică)
 *  16  Docs batchUpdate         (POST .../documents/{id}:batchUpdate, replaceAllText ×37)
 *  17  Export PDF (Drive)       (GET files/{id}/export?mimeType=application/pdf)
 *  18  Șterge Copia (Drive)     (DELETE files/{id} — fără gunoi în Drive)
 *  19  ZIP Pachet               (Code: zip-store inline → 1 arhivă din 3 PDF-uri)
 *  20  Gmail Livrare ZIP        (ZIP atașat + factură + instrucțiuni)
 *
 * + 4 sticky notes. ~30 auto-validări la fiecare generare (printre care
 * simularea reală a criptografiei cu vectori RSA 2048 + AES-256-CBC generați
 * local, evaluarea de sintaxă a TUTUROR expresiilor și simularea nodurilor
 * de generare documente pe profilul din Test Data Kit).
 *
 * Rulare:  node module-5/build-workflow-plati.js
 * Output:  module-5/autoact-workflow-plati.json
 * ============================================================ */
'use strict';

/* Prețul vine din SURSĂ (site/config.js) via config-autoact.js — nu mai e o cifră
 * scrisă manual aici. Dacă schimbi prețul, schimbi config.js doar. */
const { PRET_RON } = require('../config-autoact.js');

/* ---------- Nodul 2: parsarea body-ului form-urlencoded Netopia ---------- */
const PARSARE_BODY = `
// Netopia transmite POST form-urlencoded cu un singur câmp „data" (Base64-encoded XML/JSON).
// Un răspuns 200 cu „ok" (lipsă eroare) confirmă primirea; orice altceva = retransmisie.
const out = { ok: true };
if ($json && $json.body && $json.body.data) {
  out.data_encoded = $json.body.data;
}
return [{ json: out }];
`;
/* ---------- Nodul 14: Placeholder-e Docs — 37 înlocuiri × 3 documente ---------- */
/* Harta (37 intrări) = module-2/sabloane/placeholders.json, verificată de
 * module-2/verifica-sabloane.js contra nodului „Documente ZIP" din pipeline.
 * Documentele: cele 3 șabloane .md redactate în module-2/sabloane/.        */
const HARTA_PH = {
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

const DOCUMENTE_DOCS = [
  { cheie: '01_contract_vanzare_cumparare', doc_nume: '01-contract-vanzare-cumparare', env: 'GOOGLE_DOCS_TEMPLATE_CONTRACT' },
  { cheie: '02_cerere_drpciv', doc_nume: '02-cerere-drpciv', env: 'GOOGLE_DOCS_TEMPLATE_DRPCIV' },
  { cheie: '03_declaratii_fiscale', doc_nume: '03-declaratii-fiscale', env: 'GOOGLE_DOCS_TEMPLATE_DECLARATII' }
];

/* Codul nodului 14 (Placeholder-e Docs): produce un item per document.
 * tranzactia = profil_json din DB (schema: module-1/profil-tranzactie.schema.json)
 *            sau fallback pe coloanele aplatizate (folositor în testele integrării). */
const PLACEHOLDERE_DOCS = `
function obtine(obiect, cale) {
  return cale.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obiect);
}
let tranzactia = {};
try { tranzactia = typeof $json.profil_json === 'string' ? JSON.parse($json.profil_json) : ($json.profil_json || {}); }
catch (e) { tranzactia = {}; }
if (tranzactia.date_vanzator && tranzactia.date_cumparator && tranzactia.date_vehicul) {
  // profil complet → asigură date_tranzactie cu fallback pe coloane
  tranzactia = { ...tranzactia, id_tranzactie: tranzactia.id_tranzactie || $json.id_tranzactie };
  if (!tranzactia.date_tranzactie) tranzactia.date_tranzactie = { data_vanzarii: $json.data_vanzarii, localitate_incheiere: tranzactia.date_vanzator.localitate, suma_ron: $json.suma };
} else {
  // fallback: construiește profilul din coloanele aplatizate (integrare / DB partial)
  tranzactia = {
    id_tranzactie: $json.id_tranzactie,
    date_vanzator: { nume_complet: tranzactia.nume_vanzator || '[NECUNOSCUT]', cnp: tranzactia.cnp_vanzator || '', serie_ci: '', numar_ci: '', adresa: tranzactia.adresa_vanzator || '', localitate: '', judet: '', telefon: '', email: '' },
    date_cumparator: { nume_complet: $json.nume_cumparator || '[NECUNOSCUT]', cnp: $json.cnp_cumparator || '', serie_ci: '', numar_ci: '', adresa: $json.adresa_cumparator || '', localitate: $json.localitate_cumparator || '', judet: $json.judet_cumparator || '', telefon: '', email: $json.email_cumparator || '' },
    date_vehicul: { marca: tranzactia.marca || '[NECUNOSCUT]', model: tranzactia.model || '', vin: tranzactia.vin || '', numar_inmatriculare: tranzactia.numar_inmatriculare || '', an_fabricatie: tranzactia.an_fabricatie || '', cilindree_cm: tranzactia.cilindree_cm || '', putere_kw: tranzactia.putere_kw || '', masa_maxima_kg: tranzactia.masa_maxima_kg || '', tip_combustibil: tranzactia.tip_combustibil || '', certificat_inmatriculare_serie: tranzactia.certificat_inmatriculare_serie || '' },
    date_tranzactie: { data_vanzarii: $json.data_vanzarii || '', localitate_incheiere: '', suma_ron: $json.suma || 0, scutire_taxa_sub_24_luni: false }
  };
}
const idTr = tranzactia.id_tranzactie || $json.id_tranzactie;
const HARTA_PH = ${JSON.stringify(HARTA_PH)};
const valori = {};
for (const [ph, cale] of Object.entries(HARTA_PH)) {
  const v = obtine(tranzactia, cale);
  valori[ph] = (v === undefined || v === null) ? '' : String(v);
}
const DOCUMENTE_DOCS = ${JSON.stringify(DOCUMENTE_DOCS)};
const iesiri = [];
for (const doc of DOCUMENTE_DOCS) {
  const docId = $env[doc.env];
  if (!docId) throw new Error('Env lipsă: ' + doc.env + ' (ID-ul șablonului Google Docs)');
  const requests = [];
  for (const [ph, val] of Object.entries(valori)) {
    requests.push({ replaceAllText: { containsText: { text: '{{' + ph + '}}', matchCase: true }, replaceText: val } });
  }
  iesiri.push({ json: { doc_id: docId, doc_nume: doc.doc_nume, document_id_copie: null, id_tranzactie: idTr, valori, requests } });
}
return iesiri;
`.trim() + '\n';
/* ---------- Nodul 19: ZIP Pachet — zip-store inline (CRC32 + STORE) ---------- */
const ZIP_PACHET = `
// Colectează PDF-urile binare produse de nodul Export (3 itemi, unul per document),
// construiește arhiva cu zip-store inline (CRC32 + metoda STORE, fără npm) și
// emite UN item final cu metadatele pentru Gmail Livrare ZIP.
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; }
  return t;
})();
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xFF]; return (c ^ -1) >>> 0; }

const fisiere = [];
const numeTraf = new Set();
for (const item of items) {
  const nume = (item.json && item.json.nume_pdf) || ('document-' + fisiere.length + '.pdf');
  if (numeTraf.has(nume)) throw new Error('nume PDF duplicat: ' + nume);
  numeTraf.add(nume);
  if (!item.binary || !item.binary.data) throw new Error('PDF lipsă pentru ' + nume);
  const buf = await this.helpers.getBinaryDataBuffer(item.pairedItem !== undefined ? item.pairedItem : 0, 'data');
  fisiere.push({ nume, buffer: buf });
}
if (fisiere.length !== 3) throw new Error('Se așteptau 3 PDF-uri, am primit: ' + fisiere.length);

const acum = new Date();
const timp = (acum.getHours() << 11) | (acum.getMinutes() << 5) | (acum.getSeconds() >> 1);
const data = (((acum.getFullYear() - 1980) & 0x7F) << 9) | ((acum.getMonth() + 1) << 5) | acum.getDate();
const bucati = []; const central = []; let offset = 0;
for (const f of fisiere) {
  const nume = Buffer.from(f.nume, 'utf8');
  const crc = crc32(f.buffer);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(0, 8); local.writeUInt16LE(timp, 10); local.writeUInt16LE(data, 12);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(f.buffer.length, 18); local.writeUInt32LE(f.buffer.length, 22);
  local.writeUInt16LE(nume.length, 26); local.writeUInt16LE(0, 28);
  bucati.push(local, nume, f.buffer);
  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0x0800, 8);
  cd.writeUInt16LE(0, 10); cd.writeUInt16LE(timp, 12); cd.writeUInt16LE(data, 14); cd.writeUInt32LE(crc, 16);
  cd.writeUInt32LE(f.buffer.length, 20); cd.writeUInt32LE(f.buffer.length, 24); cd.writeUInt16LE(nume.length, 28);
  cd.writeUInt32LE(offset, 42);
  central.push(Buffer.concat([cd, nume]));
  offset += 30 + nume.length + f.buffer.length;
}
const director = Buffer.concat(central);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(fisiere.length, 8); eocd.writeUInt16LE(fisiere.length, 10);
eocd.writeUInt32LE(director.length, 12); eocd.writeUInt32LE(offset, 16);
const arhiva = Buffer.concat([...bucati, director, eocd]);

// primul item păstrează metadatele pentru Gmail (id_tranzactie, destinatar, etc.)
const meta = items[0].json;
const binar = await this.helpers.prepareBinaryData(arhiva, meta.zip_nume || (meta.id_tranzactie || 'autoact') + '.zip', 'application/zip');
return [{ json: meta, binary: { data: binar } }];
`.trim() + '\n';

/* ---------- Nodul 12: payload-ul facturii SmartBill ---------- */
const PAYLOAD_SMARTBILL = `
// Construiește factura pentru SmartBill (BLUEPRINT.md §5.1).
// Datele clientului vin aplatizate din nodul „Data Tranzacție (Postgres)" (rândul tranzacției).
const t = $json;
const dateCumparator = {
  nume: t.nume_cumparator || 'Client AutoAct',
  cnp: t.cnp_cumparator || '',
  adresa: t.adresa_cumparator || '',
  oras: t.localitate_cumparator || t.localitate || '',
  judet: t.judet_cumparator || '',
  email: t.email_cumparator || ''
};
const payload = {
  companyVatCode: $env.SMARTBILL_VAT_CODE,
  client: {
    name: dateCumparator.nume,
    vatCode: dateCumparator.cnp,
    address: { city: dateCumparator.oras, street: dateCumparator.adresa, county: dateCumparator.judet },
    countryId: 'RO',
    email: dateCumparator.email
  },
  seriesName: $env.SMARTBILL_SERIE,
  issueDate: (t.data_vanzarii || new Date().toISOString().slice(0, 10)),
  productName: 'Pachet acte transcriere auto — AutoAct',
  productDescription: 'Contract v-c + cereri DRPCIV + declarații fiscale (PDF/ZIP). TVA nu se percepe — regim simplificat (art. 282 ind. 2 C.fisc.).',
  quantity: 1,
  price: ${PRET_RON},
  currency: 'RON',
  measuringUnit: 'buc',
  saveToDraft: false,
  sendEmail: true,
  eInvoice: { sendEInvoice: true }
};
return [{ json: { ...$json, smartbill_payload: payload, order_id: $json.order_id || t.id_tranzactie } }];
`.trim() + '\n';

/* ---------- Nodul 3: decriptare + verificare semnătură Netopia ----------
 * Schema MobilPay/Netopia: env_key (256 bytes) decriptat RSA-OAEP-SHA256 →
 * AES-256-CBC (IV = primele 16 bytes din cheia AES) → JSON cu
 * order_id/amount/currency/status + HMAC-SHA256 de integritate.
 */
const DECRIPTARE_SEMNATURA = `
const crypto = require('crypto');

const CHEIE_PRIVATA = $env.NETOPIA_RSA_PRIVATE_KEY.split(String.fromCharCode(92) + 'n').join(String.fromCharCode(10));
const MPAY_SECRET = $env.NETOPIA_MPAY_SECRET;
const t0 = Date.now();

if (!$json.data_encoded) {
  return [{ json: { semnatura_ok: false, motiv: 'lipsa data' } }];
}
const buffer = Buffer.from($json.data_encoded, 'base64');
if (buffer.length < 400) {
  return [{ json: { semnatura_ok: false, motiv: 'date prea scurte' } }];
}

// 1. env_key = primii 256 bytes → RSA-OAEP(SHA-256)
const envKey = buffer.subarray(0, 256);
let aesKey;
try {
  aesKey = crypto.privateDecrypt(
    { key: CHEIE_PRIVATA, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    envKey
  );
} catch (e) {
  return [{ json: { semnatura_ok: false, motiv: 'rsa_fail: ' + e.message } }];
}

// 2. AES-256-CBC; IV = primele 16 bytes din AES key
const criptat = buffer.subarray(256);
const iv = aesKey.subarray(0, 16);
const cheieAes = aesKey.subarray(16, 48);
let decriptat;
try {
  const decipher = crypto.createDecipheriv('aes-256-cbc', cheieAes, iv);
  decriptat = Buffer.concat([decipher.update(criptat), decipher.final()]).toString('utf8');
} catch (e) {
  return [{ json: { semnatura_ok: false, motiv: 'aes_fail: ' + e.message } }];
}

let date;
try { date = JSON.parse(decriptat); }
catch (e) { return [{ json: { semnatura_ok: false, motiv: 'json_fail' } }]; }

// 3. HMAC-SHA256 pe datele esențiale (integritate)
const hashAsteptat = crypto
  .createHmac('sha256', MPAY_SECRET)
  .update([date.order_id, date.amount, date.currency, date.status].join('|'))
  .digest('hex');
if (hashAsteptat !== date.hash) {
  return [{ json: { semnatura_ok: false, motiv: 'hmac_fail' } }];
}

return [{ json: {
  semnatura_ok: true,
  durata_ms: Date.now() - t0,
  order_id: String(date.order_id),
  suma: Number(date.amount),
  moneda: String(date.currency),
  status: String(date.status),
  cod_eroare: date.error_code || null
} }];
`.trim() + '\n';

/* ---------- Definiția nodurilor ---------- */
const nodes = [];
function add(n) { nodes.push(n); }

/* 1. Webhook Netopia */
add({
  id: 'b7e5a000-0000-4000-8000-000000000001',
  name: 'Webhook Netopia',
  type: 'n8n-nodes-base.webhook',
  typeVersion: 2,
  position: [-160, 300],
  parameters: {
    httpMethod: 'POST',
    path: 'netopia',
    responseMode: 'responseNode',
    options: { rawBody: false }
  },
  webhookId: 'autoact-netopia'
});

/* 2. Parsare body */
add({
  id: 'b7e5a000-0000-4000-8000-000000000002',
  name: 'Parsare POST Netopia',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [160, 300],
  parameters: { mode: 'runOnceForAllItems', jsCode: PARSARE_BODY.trim() + '\n' }
});

/* 3. Decriptare semnătură */
add({
  id: 'b7e5a000-0000-4000-8000-000000000003',
  name: 'Decriptare Semnătură',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [480, 300],
  parameters: { mode: 'runOnceForAllItems', jsCode: DECRIPTARE_SEMNATURA }
});

/* 4. IF semnătură validă */
add({
  id: 'b7e5a000-0000-4000-8000-000000000004',
  name: 'IF Semnătură Validă',
  type: 'n8n-nodes-base.if',
  typeVersion: 2,
  position: [800, 300],
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
      combinator: 'and',
      conditions: [
        { id: 'c-semn', leftValue: '={{ $json.semnatura_ok }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }
      ]
    }
  }
});

/* 5. Respond semnătură invalidă (ramura false) */
add({
  id: 'b7e5a000-0000-4000-8000-000000000005',
  name: 'Respond Semnătură Invalidă',
  type: 'n8n-nodes-base.respondToWebhook',
  typeVersion: 1.1,
  position: [800, 520],
  parameters: {
    respondWith: 'json',
    responseBody: '={{ JSON.stringify({ ok: false, motiv: $json.motiv }) }}',
    options: { responseCode: 496 }
  }
});

/* 6. Idempotență: CTE INSERT + UNION fallback — mereu exact 1 rând */
add({
  id: 'b7e5a000-0000-4000-8000-000000000006',
  name: 'Idempotenta (Postgres)',
  type: 'n8n-nodes-base.postgres',
  typeVersion: 2.4,
  position: [1120, 300],
  parameters: {
    operation: 'executeQuery',
    query: "WITH ins AS (INSERT INTO plati_procesate (order_id, id_tranzactie, suma, moneda, status) VALUES ('{{ $json.order_id }}', '{{ $json.order_id }}', {{ $json.suma }}, '{{ $json.moneda }}', '{{ $json.status }}') ON CONFLICT (order_id) DO NOTHING RETURNING order_id, status, suma), rezultat AS (SELECT order_id, status, suma, 0 AS duplicat FROM ins UNION ALL SELECT '{{ $json.order_id }}'::text, NULL::text, NULL::numeric, 1 AS duplicat WHERE NOT EXISTS (SELECT 1 FROM ins)) SELECT * FROM rezultat;",
    options: {}
  }
});

/* 7. IF deja procesată (duplicat === 1 → true) */
add({
  id: 'b7e5a000-0000-4000-8000-000000000007',
  name: 'IF Deja Procesată',
  type: 'n8n-nodes-base.if',
  typeVersion: 2,
  position: [1440, 300],
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
      combinator: 'and',
      conditions: [
        { id: 'c-idem', leftValue: '={{ $json.duplicat }}', rightValue: 1, operator: { type: 'number', operation: 'equals' } }
      ]
    }
  }
});

/* 8. Respond „deja procesată" (ramura true) */
add({
  id: 'b7e5a000-0000-4000-8000-000000000008',
  name: 'Respond Deja Procesată',
  type: 'n8n-nodes-base.respondToWebhook',
  typeVersion: 1.1,
  position: [1440, 520],
  parameters: {
    respondWith: 'json',
    responseBody: '={{ JSON.stringify({ ok: true, duplicat: true }) }}',
    options: { responseCode: 200 }
  }
});

/* 9. Data Tranzacție (Postgres): profil_json + coloane aplatizate + passthrough status/suma */
add({
  id: 'b7e5a000-0000-4000-8000-000000000013',
  name: 'Data Tranzacție (Postgres)',
  type: 'n8n-nodes-base.postgres',
  typeVersion: 2.4,
  position: [1600, 300],
  parameters: {
    operation: 'executeQuery',
    query: "SELECT id_tranzactie, profil_json, nume_cumparator, cnp_cumparator, adresa_cumparator, localitate_cumparator, judet_cumparator, email_cumparator, data_vanzarii, '{{ $json.status }}' AS status, {{ $json.suma }} AS suma FROM tranzactii WHERE id_tranzactie = '{{ $json.order_id }}' LIMIT 1;",
    options: {}
  }
});

/* 10. IF plată confirmată */
add({
  id: 'b7e5a000-0000-4000-8000-000000000009',
  name: 'IF Plată Confirmată',
  type: 'n8n-nodes-base.if',
  typeVersion: 2,
  position: [1920, 300],
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
      combinator: 'and',
      conditions: [
        { id: 'c-status', leftValue: '={{ $json.status }}', rightValue: 'confirmed', operator: { type: 'string', operation: 'equals' } },
        { id: 'c-suma', leftValue: '={{ $json.suma }}', rightValue: PRET_RON, operator: { type: 'number', operation: 'equals' } }
      ]
    }
  }
});

/* 11. Respins (ramura false) */
add({
  id: 'b7e5a000-0000-4000-8000-000000000010',
  name: 'Respond Plată Respinsă',
  type: 'n8n-nodes-base.respondToWebhook',
  typeVersion: 1.1,
  position: [1920, 520],
  parameters: {
    respondWith: 'json',
    responseBody: '={{ JSON.stringify({ ok: true, status: $json.status, factura: false }) }}',
    options: { responseCode: 200 }
  }
});

/* 12. Payload SmartBill */
add({
  id: 'b7e5a000-0000-4000-8000-000000000011',
  name: 'Payload SmartBill',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [2240, 300],
  parameters: { mode: 'runOnceForAllItems', jsCode: PAYLOAD_SMARTBILL.trim() + '\n' }
});

/* 13. SmartBill POST */
add({
  id: 'b7e5a000-0000-4000-8000-000000000012',
  name: 'SmartBill Factură',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [2560, 300],
  parameters: {
    method: 'POST',
    url: 'https://ws.smartbill.ro:8183/SBORO/api/document/new',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpBasicAuth',
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '={{ JSON.stringify($json.smartbill_payload) }}',
    options: { timeout: 30000 }
  },
  credentials: { httpBasicAuth: { id: 'REPLACE_CRED_SMARTBILL', name: 'SmartBill Basic Auth' } }
});

/* 14. Placeholder-e Docs */
add({
  id: 'b7e5a000-0000-4000-8000-000000000014',
  name: 'Placeholder-e Docs',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [2880, 300],
  parameters: { mode: 'runOnceForAllItems', jsCode: PLACEHOLDERE_DOCS }
});

/* 15. Copie Template (Drive) — template-ul NU se modifică niciodată */
add({
  id: 'b7e5a000-0000-4000-8000-000000000015',
  name: 'Copie Template (Drive)',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [3200, 300],
  parameters: {
    method: 'POST',
    url: '={{ "https://www.googleapis.com/drive/v3/files/" + $json.doc_id + "/copy" }}',
    authentication: 'genericCredentialType',
    genericAuthType: 'oAuth2Api',
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '={{ JSON.stringify({ name: $json.doc_nume + " — " + $json.id_tranzactie }) }}',
    options: { timeout: 30000 }
  }
});

/* 16. Docs batchUpdate: replaceAllText ×37 pe copie */
add({
  id: 'b7e5a000-0000-4000-8000-000000000016',
  name: 'Docs batchUpdate',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [3520, 300],
  parameters: {
    method: 'POST',
    url: '={{ "https://docs.googleapis.com/v1/documents/" + $json.documentId + ":batchUpdate" }}',
    authentication: 'genericCredentialType',
    genericAuthType: 'oAuth2Api',
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '={{ JSON.stringify({ requests: $json.requests }) }}',
    options: { timeout: 60000 }
  }
});

/* 17. Export PDF (Drive) — responseFormat file → binar */
add({
  id: 'b7e5a000-0000-4000-8000-000000000017',
  name: 'Export PDF (Drive)',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [3840, 300],
  parameters: {
    method: 'GET',
    url: '={{ "https://www.googleapis.com/drive/v3/files/" + $json.documentId + "/export?mimeType=application%2Fpdf" }}',
    authentication: 'genericCredentialType',
    genericAuthType: 'oAuth2Api',
    options: { response: { response: { responseFormat: 'file' } }, timeout: 60000 }
  }
});

/* 18. Șterge Copia (Drive) — fără gunoi în Drive */
add({
  id: 'b7e5a000-0000-4000-8000-000000000018',
  name: 'Șterge Copia (Drive)',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [4160, 300],
  parameters: {
    method: 'DELETE',
    url: '={{ "https://www.googleapis.com/drive/v3/files/" + $json.documentId }}',
    authentication: 'genericCredentialType',
    genericAuthType: 'oAuth2Api',
    options: {}
  }
});

/* 19. ZIP Pachet */
add({
  id: 'b7e5a000-0000-4000-8000-000000000019',
  name: 'ZIP Pachet',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [4480, 300],
  parameters: { mode: 'runOnceForAllItems', jsCode: ZIP_PACHET }
});

/* 20. Gmail Livrare ZIP */
add({
  id: 'b7e5a000-0000-4000-8000-000000000020',
  name: 'Gmail Livrare ZIP',
  type: 'n8n-nodes-base.gmail',
  typeVersion: 2.1,
  position: [4800, 300],
  parameters: {
    sendTo: '={{ $json.destinatar }}',
    subject: 'AutoAct — actele tale pentru transcriere auto sunt gata (ZIP + factură)',
    emailType: 'html',
    message: '=<p>Bună, {{ $json.nume_client }},</p><p>Pachetul tău de acte este gata și îl găsești atașat, împreună cu factura.</p><h3>Ce faci după ce printezi actele</h3><ol><li>Printează PDF-urile din arhivă.</li><li>Mergi ÎNTÂI la notar cu mașina și actele originale pentru autentificarea contractului.</li><li>Semnați amândoi în fața notarului.</li><li>Mergi la DRPCIV cu contractul autentificat, CI, CIV original și dovada plății taxei de transcriere.</li><li>Primești noua înmatriculare.</li></ol><p>Verifică toate datele înainte de printare — actele se emit exact cu datele confirmate de tine la pasul de verificare.</p><p>Cu stimă,<br><strong>Echipa AutoAct</strong><br>autoact.eu</p>',
    options: { appendAttribution: false }
  }
});

/* ---------- Sticky notes ---------- */
add({
  id: 'b7e5a000-0000-4000-8000-0000000000a1',
  name: 'Sticky - Instalare Plati',
  type: 'n8n-nodes-base.stickyNote',
  typeVersion: 1,
  position: [-220, -80],
  parameters: {
    width: 560, height: 300, color: 4,
    content: '## INSTALARE — AutoAct Plăți + Documente (Netopia → SmartBill → Docs → ZIP)\\n1) n8n → ⋯ → **Import from File** → acest JSON.\\n2) **Schema DB:** rulează o dată module-5/plati-schema.sql (docker compose exec -T postgres psql -U autoact -d autoact).\\n3) **Env (docker-compose.yml):** NETOPIA_RSA_PRIVATE_KEY, NETOPIA_MPAY_SECRET, SMARTBILL_VAT_CODE, SMARTBILL_SERIE, GOOGLE_DOCS_TEMPLATE_CONTRACT, GOOGLE_DOCS_TEMPLATE_DRPCIV, GOOGLE_DOCS_TEMPLATE_DECLARATII.\\n4) **Credentials n8n:** SmartBill Basic Auth + Google OAuth2 (Drive + Docs scope-uri) — nodurile 15–18.\\n5) **Netopia:** URL de confirmare https://autoact.eu/webhook/netopia.\\n6) Activează workflow-ul.'
  }
});
add({
  id: 'b7e5a000-0000-4000-8000-0000000000a2',
  name: 'Sticky - Semnătură',
  type: 'n8n-nodes-base.stickyNote',
  typeVersion: 1,
  position: [420, 560],
  parameters: {
    width: 420, height: 220, color: 5,
    content: '### Semnătura Netopia (nodul 3)\\n1) env_key = primii 256 bytes → RSA-OAEP-SHA256 cu cheia privată.\\n2) AES-256-CBC, IV = primele 16 bytes din AES key.\\n3) HMAC-SHA256 pe order_id|amount|currency|status cu MPAY_SECRET.\\nOrice eșec → răspuns 496, fără alertă admin.\\n⚠ Necesită NODE_FUNCTION_ALLOW_BUILTIN=fs,path,crypto (Modulul 3).'
  }
});
add({
  id: 'b7e5a000-0000-4000-8000-0000000000a3',
  name: 'Sticky - Idempotență',
  type: 'n8n-nodes-base.stickyNote',
  typeVersion: 1,
  position: [1380, 560],
  parameters: {
    width: 460, height: 200, color: 6,
    content: '### Idempotență pe order_id (nodul 6)\\nCTE INSERT ... ON CONFLICT DO NOTHING + UNION fallback → mereu exact 1 rând: duplicat=0 (prima dată) sau duplicat=1 (retransmisie).\\nRetransmisiile Netopia mor aici — zero facturi duplicate.'
  }
});
add({
  id: 'b7e5a000-0000-4000-8000-0000000000a4',
  name: 'Sticky - Generare Documente',
  type: 'n8n-nodes-base.stickyNote',
  typeVersion: 1,
  position: [2820, 560],
  parameters: {
    width: 520, height: 220, color: 3,
    content: '### Generare Documente (nodurile 14–18)\\nTemplate-urile Google Docs NU se modifică niciodată: nodul 15 face o COPIE per document, nodul 16 aplică replaceAllText ×37, nodul 17 exportă PDF, nodul 18 ȘTERGE copia.\\nID-urile șabloanelor vin din env: GOOGLE_DOCS_TEMPLATE_CONTRACT / _DRPCIV / _DECLARATII.\\nZIP-ul (nodul 19) e construit inline (CRC32 + STORE, zero npm).'
  }
});

/* ---------- Conexiuni ---------- */
const next = (name) => [{ node: name, type: 'main', index: 0 }];
const connections = {
  'Webhook Netopia':           { main: [next('Parsare POST Netopia')] },
  'Parsare POST Netopia':      { main: [next('Decriptare Semnătură')] },
  'Decriptare Semnătură':      { main: [next('IF Semnătură Validă')] },
  'IF Semnătură Validă':       { main: [next('Idempotenta (Postgres)'), next('Respond Semnătură Invalidă')] },
  'Idempotenta (Postgres)':    { main: [next('IF Deja Procesată')] },
  'IF Deja Procesată':         { main: [next('Respond Deja Procesată'), next('Data Tranzacție (Postgres)')] },
  'Data Tranzacție (Postgres)': { main: [next('IF Plată Confirmată')] },
  'IF Plată Confirmată':       { main: [next('Payload SmartBill'), next('Respond Plată Respinsă')] },
  'Payload SmartBill':         { main: [next('SmartBill Factură')] },
  'SmartBill Factură':         { main: [next('Placeholder-e Docs')] },
  'Placeholder-e Docs':        { main: [next('Copie Template (Drive)')] },
  'Copie Template (Drive)':    { main: [next('Docs batchUpdate')] },
  'Docs batchUpdate':          { main: [next('Export PDF (Drive)')] },
  'Export PDF (Drive)':        { main: [next('Șterge Copia (Drive)')] },
  'Șterge Copia (Drive)':      { main: [next('ZIP Pachet')] },
  'ZIP Pachet':                { main: [next('Gmail Livrare ZIP')] }
};

/* ---------- Asamblare + scriere ---------- */
const workflow = {
  name: 'AutoAct — Plăți Netopia + Facturare SmartBill + Documente (v1)',
  nodes,
  connections,
  active: false,
  settings: { executionOrder: 'v1' },
  pinData: {},
  meta: { instanceId: 'autoact-plati-v1' }
};

const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'autoact-workflow-plati.json');
fs.writeFileSync(OUT, JSON.stringify(workflow, null, 2) + '\n');

/* ================= AUTO-VALIDĂRI ================= */
let esecuri = 0;
const assert = (cond, mesaj, detaliu) => {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + mesaj + (detaliu && !cond ? '  [' + detaliu + ']' : ''));
  if (!cond) esecuri++;
};

const AsyncFunction = (async function () {}).constructor;
// Mock crypto pentru simulează(): string-urile jsCode NU se execută în validator,
// dar expresiile evaluează new Function() care poate întâlni require('crypto').
const REQUIRE_MOCK = (nume) => {
  if (nume === 'crypto') return { constants: { RSA_PKCS1_OAEP_PADDING: 4 }, privateDecrypt: () => Buffer.alloc(48), createDecipheriv: () => ({ update: () => Buffer.alloc(0), final: () => Buffer.alloc(0) }), createHmac: () => ({ update: () => ({ digest: () => '0'.repeat(64) }) }) };
  if (nume === 'fs') return { existsSync: () => true, readFileSync: () => Buffer.alloc(0) };
  throw new Error('require mock: modulul ' + nume + ' nu e permis');
};
REQUIRE_MOCK.cache = {};
function simuleaza(jsCode, ctx) {
  const fn = new AsyncFunction('$json', '$env', 'items', 'require', jsCode);
  return fn.call({ helpers: ctx.helpers || {} }, ctx.$json || {}, ctx.$env || {}, ctx.items || [], ctx.requireMock || REQUIRE_MOCK);
}
function evalueazaExpresie(expr, json, env) {
  if (typeof expr !== 'string' || !expr.startsWith('=')) return expr;
  const m = expr.match(/^=\{\{([\s\S]*)\}\}$/);
  if (!m) throw new Error('expresie nerecunoscută: ' + expr.slice(0, 60));
  // require e mock-uit: expresiile care îl folosesc (ex: decriptare) nu trebuie să execute cod real în validator
  const requireMock = (nume) => { if (nume === 'crypto') return { constants: { RSA_PKCS1_OAEP_PADDING: 4 } }; throw new Error('require mock: ' + nume); };
  return new Function('$json', '$env', 'require', 'return (' + m[1] + ');')(json, env || {}, requireMock);
}

(async () => {
  // (a) JSON re-parse + structură
  const citit = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  assert(citit.nodes.length === 24, 'JSON valid cu 24 noduri (20 pipeline + 4 sticky) — găsite: ' + citit.nodes.length);

  const numeSet = new Set(citit.nodes.map((n) => n.name));
  let muchii = 0;
  for (const [sursa, con] of Object.entries(citit.connections)) {
    if (!numeSet.has(sursa)) { assert(false, 'sursă inexistentă: ' + sursa); continue; }
    for (const ramura of con.main) for (const tinta of ramura) {
      muchii++;
      if (!numeSet.has(tinta.node)) assert(false, 'țintă inexistentă: ' + tinta.node);
    }
  }
  assert(muchii === 19, '19 muchii în graf — găsite: ' + muchii);
  const adiacenta = {};
  for (const [sursa, con] of Object.entries(citit.connections)) {
    adiacenta[sursa] = adiacenta[sursa] || [];
    for (const ramura of con.main) for (const tinta of ramura) adiacenta[sursa].push(tinta.node);
  }
  const vazute = new Set(['Webhook Netopia']);
  const coada = ['Webhook Netopia'];
  while (coada.length) {
    const curent = coada.shift();
    for (const urm of adiacenta[curent] || []) if (!vazute.has(urm)) { vazute.add(urm); coada.push(urm); }
  }
  const pipeline = citit.nodes.filter((n) => n.type !== 'n8n-nodes-base.stickyNote');
  assert(vazute.size === pipeline.length, 'graf conex: ' + vazute.size + '/' + pipeline.length + ' accesibile de la Webhook');

  // (b) Ramurile IF pe pozițiile corecte
  const c = citit.connections;
  assert(c['IF Semnătură Validă'].main[0][0].node === 'Idempotenta (Postgres)' && c['IF Semnătură Validă'].main[1][0].node === 'Respond Semnătură Invalidă', 'IF Semnătură: true→Postgres, false→496');
  assert(c['IF Deja Procesată'].main[0][0].node === 'Respond Deja Procesată' && c['IF Deja Procesată'].main[1][0].node === 'Data Tranzacție (Postgres)', 'IF Deja: true→duplicat, false→Data Tranzacție');
  assert(c['IF Plată Confirmată'].main[0][0].node === 'Payload SmartBill' && c['IF Plată Confirmată'].main[1][0].node === 'Respond Plată Respinsă', 'IF Plată: true→SmartBill, false→respins');
  assert(c['SmartBill Factură'].main[0][0].node === 'Placeholder-e Docs' && c['ZIP Pachet'].main[0][0].node === 'Gmail Livrare ZIP', 'lanț: SmartBill→Docs→...→ZIP→Gmail');

  // (c) Sintaxa TUTUROR expresiilor din workflow (nicio expresie invalidă)
  let expresiiVerificate = 0, expresiiRele = [];
  const parcurge = (obiect, cale) => {
    if (typeof obiect === 'string' && obiect.startsWith('=')) {
      expresiiVerificate++;
      try { evalueazaExpresie(obiect, {}, {}); } catch (e) {
        if (!/expresie nerecunoscută/.test(e.message)) expresiiRele.push(cale + ': ' + e.message);
      }
    } else if (obiect && typeof obiect === 'object') {
      for (const [k, v] of Object.entries(obiect)) parcurge(v, cale + '.' + k);
    }
  };
  for (const n of citit.nodes) parcurge(n.parameters, n.name);
  assert(expresiiRele.length === 0, 'toate cele ' + expresiiVerificate + ' expresii au sintaxă JS validă', expresiiRele.join(' | '));

  // (d) Simulare criptografică — vectori RSA 2048 + AES-256-CBC generați local
  const crypto = require('crypto');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  // pentru simularea REALĂ a nodului 3 folosim require adevărat (nu mock-ul) — ctxDecript e definit după ENV mai jos
  const MPAY_SECRET = 'secret-de-test';
  const comanda = { order_id: 'tr_ab12cd34ef56ab12', amount: PRET_RON, currency: 'RON', status: 'confirmed', error_code: null };
  comanda.hash = crypto.createHmac('sha256', MPAY_SECRET).update([comanda.order_id, comanda.amount, comanda.currency, comanda.status].join('|')).digest('hex');
  const aesKey = crypto.randomBytes(48);
  const cipher = crypto.createCipheriv('aes-256-cbc', aesKey.subarray(16, 48), aesKey.subarray(0, 16));
  const criptat = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(comanda))), cipher.final()]);
  const envKey = crypto.publicEncrypt({ key: publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, aesKey);
  const ENV = { NETOPIA_RSA_PRIVATE_KEY: privateKey.export({ type: 'pkcs1', format: 'pem' }).toString(), NETOPIA_MPAY_SECRET: MPAY_SECRET };
  const nodDecript = citit.nodes.find((n) => n.name === 'Decriptare Semnătură');
  const outSemn = await simuleaza(nodDecript.parameters.jsCode, { $json: { data_encoded: Buffer.concat([envKey, criptat]).toString('base64') }, $env: ENV, requireMock: require });
  assert(outSemn[0].json.semnatura_ok === true && outSemn[0].json.order_id === 'tr_ab12cd34ef56ab12', 'Decriptare: semnătură validă acceptată + order_id extras');

  // (e) Simulare nodul 14 (Placeholder-e Docs) pe profilul din Test Data Kit
  const kit = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'module-1', 'test-data-kit.json'), 'utf8')).intrari;
  const nodPh = citit.nodes.find((n) => n.name === 'Placeholder-e Docs');
  const ENV_DOCS = { GOOGLE_DOCS_TEMPLATE_CONTRACT: 'DOCID_CONTRACT', GOOGLE_DOCS_TEMPLATE_DRPCIV: 'DOCID_DRPCIV', GOOGLE_DOCS_TEMPLATE_DECLARATII: 'DOCID_DECL' };
  const profil = {
    id_tranzactie: 'tr_ab12cd34ef56ab12',
    date_vanzator: { nume_complet: kit[0].nume_fictiv, cnp: kit[0].cnp, serie_ci: 'RX', numar_ci: '123456', adresa: kit[0].adresa_fictiva, localitate: 'Bucuresti (Sector 1)', judet: 'Bucuresti Sector 1', telefon: '+40700001000', email: 'vanzator1@example.com' },
    date_cumparator: { nume_complet: kit[1].nume_fictiv, cnp: kit[1].cnp, serie_ci: 'YA', numar_ci: '234567', adresa: kit[1].adresa_fictiva, localitate: 'Cluj-Napoca', judet: 'Cluj', telefon: '+40700002000', email: 'cumparator2@example.com' },
    date_vehicul: { marca: 'Dacia', model: 'Logan', vin: kit[0].vin_fictiv, numar_inmatriculare: 'B-123-ABC', an_fabricatie: 2016, cilindree_cm: 1461, putere_kw: 55, masa_maxima_kg: 1730, odometru_km: 154000, tip_combustibil: 'motorina', certificat_inmatriculare_serie: 'AB123456' },
    date_tranzactie: { data_vanzarii: '2026-09-26', localitate_incheiere: 'Bucuresti', suma_ron: 9500, scutire_taxa_sub_24_luni: false }
  };
  const outPh = await simuleaza(nodPh.parameters.jsCode, { $json: { profil_json: profil, id_tranzactie: profil.id_tranzactie, status: 'confirmed', suma: PRET_RON }, $env: ENV_DOCS, items: [] });
  assert(outPh.length === 3, 'Placeholder-e Docs: 3 itemi (unul per document) — obținuți: ' + outPh.length);
  assert(outPh[0].json.requests.length === 37, 'Placeholder-e Docs: 37 replaceAllText per document — obținute: ' + outPh[0].json.requests.length);
  const hartaCanonica = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'module-2', 'sabloane', 'placeholders.json'), 'utf8')).placeholders;
  const phInRequests = outPh[0].json.requests.map((r) => r.replaceAllText.containsText.text.slice(2, -2));
  assert(phInRequests.every((ph) => hartaCanonica[ph] !== undefined) && phInRequests.length === Object.keys(hartaCanonica).length, 'Placeholder-e Docs: placeholder-ele = EXACT harta canonică (37/37)');
  const reqVin = outPh[0].json.requests.find((r) => r.replaceAllText.containsText.text === '{{vehicul_vin}}');
  assert(reqVin.replaceAllText.replaceText === kit[0].vin_fictiv, 'Placeholder-e Docs: {{vehicul_vin}} = VIN-ul din kit');
  const reqNume = outPh[0].json.requests.find((r) => r.replaceAllText.containsText.text === '{{vanzator_nume}}');
  assert(reqNume.replaceAllText.replaceText === kit[0].nume_fictiv, 'Placeholder-e Docs: {{vanzator_nume}} = numele din kit');

  // (f) Simulare lanț 15→19: expresii reale + ZIP pe PDF-uri fake
  const docIdCopie = 'COPIE_123';
  const item = outPh[0].json;
  const nodCopie = citit.nodes.find((n) => n.name === 'Copie Template (Drive)');
  const urlCopie = evalueazaExpresie(nodCopie.parameters.url, item, ENV_DOCS);
  assert(urlCopie === 'https://www.googleapis.com/drive/v3/files/DOCID_CONTRACT/copy', 'Copie Template: URL corect cu doc_id din env');
  const bodyCopie = JSON.parse(evalueazaExpresie(nodCopie.parameters.jsonBody, item, ENV_DOCS));
  assert(bodyCopie.name === '01-contract-vanzare-cumparare — tr_ab12cd34ef56ab12', 'Copie Template: numele copiei include document + tranzacție');

  const nodBatch = citit.nodes.find((n) => n.name === 'Docs batchUpdate');
  const urlBatch = evalueazaExpresie(nodBatch.parameters.url, { documentId: docIdCopie });
  assert(urlBatch === 'https://docs.googleapis.com/v1/documents/COPIE_123:batchUpdate', 'batchUpdate: URL pe copie (template-ul rămâne intact)');
  const bodyBatch = JSON.parse(evalueazaExpresie(nodBatch.parameters.jsonBody, item));
  assert(bodyBatch.requests.length === 37 && bodyBatch.requests[0].replaceAllText.containsText.matchCase === true, 'batchUpdate: 37 înlocuiri, matchCase true');

  const nodExport = citit.nodes.find((n) => n.name === 'Export PDF (Drive)');
  const urlExport = evalueazaExpresie(nodExport.parameters.url, { documentId: docIdCopie });
  assert(urlExport === 'https://www.googleapis.com/drive/v3/files/COPIE_123/export?mimeType=application%2Fpdf', 'Export PDF: URL corect (mimeType encodat)');

  const nodSterge = citit.nodes.find((n) => n.name === 'Șterge Copia (Drive)');
  const urlSterge = evalueazaExpresie(nodSterge.parameters.url, { documentId: docIdCopie });
  assert(urlSterge === 'https://www.googleapis.com/drive/v3/files/COPIE_123' && nodSterge.parameters.method === 'DELETE', 'Șterge Copia: DELETE pe copie');

  // ZIP: 3 PDF-uri fake cu semnături PK reale
  const nodZip = citit.nodes.find((n) => n.name === 'ZIP Pachet');
  const fakePdfs = ['01-contract-vanzare-cumparare', '02-cerere-drpciv', '03-declaratii-fiscale'].map((nume, i) => ({
    json: { id_tranzactie: profil.id_tranzactie, destinatar: 'cumparator2@example.com', nume_client: kit[1].nume_fictiv, zip_nume: profil.id_tranzactie + '.zip', nume_pdf: nume + '.pdf' },
    binary: { data: { data: Buffer.from('%PDF-1.7\\n' + 'X'.repeat(1000 + i * 500)).toString('base64'), mimeType: 'application/pdf' } }
  }));
  const helpersZip = { getBinaryDataBuffer: async (i, k) => Buffer.from(fakePdfs[i].binary.data.data, 'base64'), prepareBinaryData: async (buf, nume) => ({ data: buf.toString('base64'), fileName: nume, mimeType: 'application/zip' }) };
  const outZip = await simuleaza(nodZip.parameters.jsCode, { items: fakePdfs, helpers: helpersZip, $json: {}, $env: {} });
  const zipBuf = Buffer.from(outZip[0].binary.data.data, 'base64');
  assert(zipBuf.readUInt32LE(0) === 0x04034b50 && zipBuf.readUInt32LE(zipBuf.length - 22) === 0x06054b50, 'ZIP Pachet: semnăturile PK local header + EOCD prezente');
  const eocdCount = zipBuf.readUInt16LE(zipBuf.length - 22 + 10);
  assert(eocdCount === 3, 'ZIP Pachet: 3 intrări în arhivă — obținute: ' + eocdCount);

  // (g) Payload SmartBill pe profil aplatizat (după refactor t=$json)
  const nodPayload = citit.nodes.find((n) => n.name === 'Payload SmartBill');
  const outPayload = await simuleaza(nodPayload.parameters.jsCode, {
    $json: { order_id: profil.id_tranzactie, nume_cumparator: kit[1].nume_fictiv, cnp_cumparator: kit[1].cnp, adresa_cumparator: kit[1].adresa_fictiva, localitate_cumparator: kit[1].localitate, judet_cumparator: kit[1].judet, email_cumparator: 'cumparator2@example.com', data_vanzarii: '2026-09-26' },
    $env: { SMARTBILL_VAT_CODE: 'RO12345678', SMARTBILL_SERIE: 'AUTOACT' }
  });
  const p = outPayload[0].json.smartbill_payload;
  assert(p.client.name === kit[1].nume_fictiv && p.client.vatCode === kit[1].cnp && p.price === PRET_RON && p.eInvoice.sendEInvoice === true, 'SmartBill: payload corect din coloanele aplatizate');

  console.log('');
  console.log('Output: ' + OUT);
  console.log(esecuri === 0 ? 'TOATE VALIDĂRILE AU TRECUT ✔' : esecuri + ' VALIDĂRI EȘUATE ✘');
  process.exit(esecuri === 0 ? 0 : 1);
})().catch((e) => {
  console.error('EROARE VALIDARE:', e && e.message ? e.message : e);
  process.exit(1);
});
