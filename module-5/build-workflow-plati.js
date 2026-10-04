/* ============================================================
 * AutoAct | Modulul 5 | build-workflow-plati.js
 * Generează module-5/autoact-workflow-plati.json — workflow-ul n8n
 * pentru plată + generare documente (BLUEPRINT.md §5.1),
 * importabil prin n8n → ⋯ → Import from File.
 ** 17 noduri pipeline:
 *   1  Webhook Stripe           (POST /webhook/stripe, responseNode, raw body)
 *   2  Verificare Semnătură     (Code: HMAC-SHA256 pe octeții EXACTI ai body-ului)
 *   3  IF Semnătură Validă      (true/false)
 *   4  Respond Semnătură        (ramura false → cod 400, fără alerte)
 *   5  Idempotență (Postgres)   (CTE INSERT + UNION fallback — mereu exact 1 rând)
 *   6  IF Deja Procesată        (duplicat === 1 → true)
 *   7  Respond După             (ramura true → cod 200 „deja procesat")
 *   8  Data Tranzacție (PG)     (SELECT profil_json + coloane aplatizate)
 *   9  IF Plată Confirmată      (eveniment plătit && suma === PREȚ)
 *   10  Respond Respins          (ramura false → cod 200 + status neplătit)
 *   11  Placeholder-e Docs       (Code: 37 înlocuiri × 3 documente din profil_json)
 *   12  Copie Template (Drive)   (POST files/{id}/copy — template-ul NU se modifică)
 *   13  Docs batchUpdate         (POST .../documents/{id}:batchUpdate, replaceAllText ×37)
 *   14  Export PDF (Drive)       (GET files/{id}/export?mimeType=application/pdf)
 *   15  Șterge Copia (Drive)     (DELETE files/{id} — fără gunoi în Drive)
 *   16  ZIP Pachet               (Code: zip-store inline → 1 arhivă din 3 PDF-uri)
 *   17  Gmail Livrare ZIP        (ZIP atașat + instrucțiuni; factura vine de la Stripe)
 *
 * ⚠ FACTURARE: nu mai există nod de facturare. Stripe rulează în „Managed
 * Payments" (Merchant of Record): el emite factura și chitanța cu TVA și
 * le trimite clientului. Un nod de facturare aici ar produce un al doilea
 * document fiscal pentru aceeași plată.
 *
 * + 4 sticky notes. ~30 auto-validări la fiecare generare (printre care
 * simularea reală a criptografiei cu antet Stripe-Signature generat local,
 * evaluarea de sintaxă a TUTUROR expresiilor și simularea nodurilor
 * de generare documente pe profilul din Test Data Kit).
 *
 * Rulare:  node module-5/build-workflow-plati.js
 * Output:  module-5/autoact-workflow-plati.json
 * ============================================================ */
'use strict';

/* Prețul vine din SURSĂ (site/config.js) via config-autoact.js — nu mai e o cifră
 * scrisă manual aici. Dacă schimbi prețul, schimbi config.js doar. */
const { PRET_RON, STRIPE } = require('../config-autoact.js');

/* Stripe trimite suma în unități mici (ceni). Un factor scris în șirul
 * de mai jos ar fi încă o valoare de întreținut lângă preț — îl notăm
 * aici, în cod, și îl interpolăm. */
const FACTOR_CENTI = 100;

/* ---------- Nodul 2: verificarea semnăturii Stripe ----------
 * Antetul `Stripe-Signature` are forma `t=<unix>,v1=<hex>`; semnătura
 * e HMAC-SHA256(secret, „<t>.<body>") peste OCTEȚII EXACTI ai body-ului.
 * De aceea semnătura nu poate fi verificată pe obiectul parsat — un JSON
 * re-serializat are altă ordine a cheilor și altă spațiere, deci hash-ul
 * nu mai coincide. Comparația e constantă în timp (timingSafeEqual) și
 * antetele mai vechi de 300 s sunt refuzate: altfel un body capturat
 * ar putea fi reluat oricând drept plată nouă.
 */
const VERIFICARE_SEMNATURA = `
const crypto = require('crypto');

const TOLERANTA_S = 300;
const t0 = Date.now();

/* Body-ul trebuie să ajungă CRUD (opțiunea „Raw Body" a nodului Webhook).
 * Dacă n8n l-a parsat, semnătura nu mai poate fi verificată corect — și nu
 * e corect nici să încercăm o potrivire „aproape": respingem evenimentul. */
let raw = null;
if (Buffer.isBuffer($json.body)) raw = $json.body;
else if (typeof $json.body === 'string') raw = Buffer.from($json.body, 'utf8');
if (!raw) return [{ json: { semnatura_ok: false, motiv: 'body_raw_lipsa' } }];

const antet = ($json.headers && ($json.headers['stripe-signature'] || $json.headers['Stripe-Signature'])) || '';
const campuri = {};
for (const parte of String(antet).split(',')) {
  const i = parte.indexOf('=');
  if (i > 0) campuri[parte.slice(0, i).trim()] = parte.slice(i + 1).trim();
}
const t = Number(campuri.t);
const v1 = campuri.v1 || '';
if (!Number.isFinite(t) || !v1) return [{ json: { semnatura_ok: false, motiv: 'antet_invalid' } }];

/* Antet prea vechi = body capturat și reluat ulterior. */
if (Math.abs(Date.now() / 1000 - t) > TOLERANTA_S) {
  return [{ json: { semnatura_ok: false, motiv: 'semnatura_expirata' } }];
}

const secret = $env.STRIPE_WEBHOOK_SECRET;
if (!secret) return [{ json: { semnatura_ok: false, motiv: 'secret_lipsa' } }];

const asteptat = crypto
  .createHmac('sha256', secret)
  .update(t + '.' + raw.toString('utf8'), 'utf8')
  .digest('hex');
const a = Buffer.from(asteptat, 'utf8');
const b = Buffer.from(v1, 'utf8');
if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
  return [{ json: { semnatura_ok: false, motiv: 'semnatura_invalida' } }];
}

/* Abia acum evenimentul e autentic și îl parsăm. */
let ev;
try { ev = JSON.parse(raw.toString('utf8')); }
catch (e) { return [{ json: { semnatura_ok: false, motiv: 'json_invalid' } }]; }

const obiect = (ev.data && ev.data.object) || {};

/* Suma vine în unități mici și în notația minorității („ron" = lei).
 * O normalizăm o singură dată, aici, ca restul fluxului să lucreze în lei. */
const centi = Number(obiect.amount_total || obiect.amount_received || 0);
const platita = ev.type === 'checkout.session.completed' && obiect.payment_status === 'paid';

/* client_reference_id e id_tranzactie pus de Payment Link (nodul „Respond
 * Plata" din pipeline) — e singurul legătură dintre plată și dosar. */
const order_id = obiect.client_reference_id || (obiect.metadata && obiect.metadata.id_tranzactie) || null;
if (!order_id) {
  return [{ json: { semnatura_ok: true, fara_tranzactie: true, motiv: 'fara_client_reference_id' } }];
}

return [{ json: {
  semnatura_ok: true,
  durata_ms: Date.now() - t0,
  event_id: String(ev.id || ''),
  event_type: String(ev.type || ''),
  order_id: String(order_id),
  suma: centi / ${FACTOR_CENTI},
  moneda: String(obiect.currency || '').toUpperCase(),
  status: platita ? 'confirmed' : String(ev.type || 'necunoscut').split('.').join('_'),
  email: (obiect.customer_details && obiect.customer_details.email) || obiect.customer_email || null
} }];
`.trim() + '\n';

/* ---------- Nodul 12: Placeholder-e Docs — 37 înlocuiri × 3 documente ---------- */
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

/* Codul nodului 12 (Placeholder-e Docs): produce un item per document.
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
/* ---------- Nodul 17: ZIP Pachet — zip-store inline (CRC32 + STORE) ---------- */
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

/* PDF-urile le luăm EXPLICIT din nodul „Export PDF (Drive)", nu din items.
 * Motivul: între export și acest nod stă „Șterge Copia (Drive)" — un nod
 * HTTP Request, care înlocuiește itemul cu răspunsul DELETE și pierde
 * binarele. Citind din items[].binary am primi „PDF lipsă" pentru toate cele
 * trei documente. $('...') accesează ieșirea oricărui nod, indiferent ce s-a
 * întâmplat între timp. */
const exportate = $('Export PDF (Drive)').all();
const DOCUMENTE_DOCS = ${JSON.stringify(DOCUMENTE_DOCS)};
if (exportate.length !== DOCUMENTE_DOCS.length) {
  throw new Error('Export PDF a produs ' + exportate.length + ' fișiere, așteptam ' + DOCUMENTE_DOCS.length + '.');
}

const fisiere = [];
const numeTraf = new Set();
for (let i = 0; i < exportate.length; i++) {
  const doc = DOCUMENTE_DOCS[i];
  const binar = exportate[i].binary && exportate[i].binary.data;
  if (!binar || !binar.data) throw new Error('PDF lipsă pentru ' + doc.doc_nume + '.pdf');
  const buffer = Buffer.from(binar.data, 'base64');
  if (buffer.length === 0) throw new Error('PDF gol pentru ' + doc.doc_nume + '.pdf');
  const nume = doc.doc_nume + '.pdf';
  numeTraf.add(nume);
  fisiere.push({ nume, buffer });
}
if (numeTraf.size !== DOCUMENTE_DOCS.length) throw new Error('nume PDF duplicat în arhivă');
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

/* Metadatele de livrare (destinatar, nume_client) le pune nodul „Date Livrare" —
 * și ele pierdute de nodurile HTTP intermediare. Le luăm direct din ieșirea
 * acelui nod prin $('Date Livrare'), care funcționează indiferent ce au făcut
 * nodurile de pe drum. Fără destinatar nu livrăm: un ZIP fără destinatar ar
 * arde creditele Google Docs și nu ar ajunge la nimeni. */
const livrare = $('Date Livrare').first().json;
if (!livrare || !livrare.destinatar) {
  throw new Error('Date Livrare nu a produs un destinatar — pachetul nu poate fi livrat.');
}
const meta = {
  ...livrare,
  zip_nume: livrare.zip_nume || ((livrare.id_tranzactie || 'autoact') + '.zip')
};
const binar = await this.helpers.prepareBinaryData(arhiva, meta.zip_nume, 'application/zip');
return [{ json: meta, binary: { data: binar } }];`.trim() + '\n';

/* ---------- Nodul 11: datele de livrare ----------
 * Nu mai există facturare proprie: Stripe rulează ca Merchant of Record
 * („Managed Payments") și îi trimite clientului factura cu TVA. Acest nod
 * face două lucruri, amândouă necesare pentru ca e-mailul să ajungă:
 *   · completează destinatarul din datele plății (Payment Link-ul cere
 *     e-mail, iar profilul din DB poate să nu-l aibă încă);
 *   · păstrează explicit faptul că suma e cea contractată, TVA inclus,
 *     ca un viitor nod de editare să nu confunde suma cu prețul.
 */
const DATE_LIVRARE = `
// $json vine din nodul „Data Tranzacție (Postgres)" (profil + coloane
// aplatizate), dar adresa de livrare trebuie să fie cea folosită la plată:
// clientul o introduce la checkout, iar dosarul poate să nu o conțină.
const t = $json;
const email = t.email_cumparator || $json.email_plata || '';
if (!email) throw new Error('Fără adresă de e-mail: nu se poate livre pachetul. Completează profilul sau cere clientului adresa la checkout.');
return [{ json: {
  ...t,
  destinatar: email,
  nume_client: t.nume_cumparator || 'Client AutoAct',
  suma_plata: ${PRET_RON},
  factura_emisa_de: 'stripe',
  tva_inclus: true
} }];
`.trim() + '\n';
/* ---------- Definiția nodurilor ---------- */
const nodes = [];
function add(n) { nodes.push(n); }

/* 1. Webhook Stripe — cu RAW BODY obligatoriu: semnătura Stripe se
 * calculează peste octeții exacti ai payload-ului, iar un body parsat și
 * re-serializat ar produce alt hash. Fără „Raw Body", orice plată ar fi
 * respinsă drept semnătură invalidă. */
add({
  id: 'b7e5a000-0000-4000-8000-000000000001',
  name: 'Webhook Stripe',
  type: 'n8n-nodes-base.webhook',
  typeVersion: 2,
  position: [-160, 300],
  parameters: {
    httpMethod: 'POST',
    path: 'stripe',
    responseMode: 'responseNode',
    options: { rawBody: true }
  },
  webhookId: 'autoact-stripe'
});

/* 2. Verificare semnătură */
add({
  id: 'b7e5a000-0000-4000-8000-000000000002',
  name: 'Verificare Semnătură',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [160, 300],
  parameters: { mode: 'runOnceForAllItems', jsCode: VERIFICARE_SEMNATURA.trim() + '\n' }
});

/* 3. IF semnătură validă */
add({
  id: 'b7e5a000-0000-4000-8000-000000000004',
  name: 'IF Semnătură Validă',
  type: 'n8n-nodes-base.if',
  typeVersion: 2,
  position: [480, 300],
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
      combinator: 'and',
      conditions: [
        { id: 'c-semn', leftValue: '={{ $json.semnatura_ok }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } },
        { id: 'c-tranz', leftValue: '={{ $json.fara_tranzactie !== true }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }
      ]
    }
  }
});

/* 4. Respond semnătură invalidă (ramura false) */
add({
  id: 'b7e5a000-0000-4000-8000-000000000005',
  name: 'Respond Semnătură Invalidă',
  type: 'n8n-nodes-base.respondToWebhook',
  typeVersion: 1.1,
  position: [480, 520],
  parameters: {
    respondWith: 'json',
    responseBody: '={{ JSON.stringify({ ok: false, motiv: $json.motiv }) }}',
    options: { responseCode: 400 }
  }
});

/* 5. Idempotență: CTE INSERT + UNION fallback — mereu exact 1 rând */
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

/* 6. IF deja procesată (duplicat === 1 → true) */
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

/* 8. Data Tranzacție (Postgres): profil_json + coloane aplatizate + passthrough status/suma */
add({
  id: 'b7e5a000-0000-4000-8000-000000000013',
  name: 'Data Tranzacție (Postgres)',
  type: 'n8n-nodes-base.postgres',
  typeVersion: 2.4,
  position: [1600, 300],
  parameters: {
    operation: 'executeQuery',
    query: "SELECT id_tranzactie, profil_json, nume_cumparator, cnp_cumparator, adresa_cumparator, localitate_cumparator, judet_cumparator, email_cumparator, data_vanzarii, '{{ $json.status }}' AS status, {{ $json.suma }} AS suma, '{{ $json.email }}' AS email_plata FROM tranzactii WHERE id_tranzactie = '{{ $json.order_id }}' LIMIT 1;",
    options: {}
  }
});

/* 9. IF plată confirmată */
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
        { id: 'c-moneda', leftValue: '={{ $json.moneda }}', rightValue: 'RON', operator: { type: 'string', operation: 'equals' } },
        { id: 'c-suma', leftValue: '={{ $json.suma }}', rightValue: PRET_RON, operator: { type: 'number', operation: 'equals' } }
      ]
    }
  }
});

/* 10. Respins (ramura false) */
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

/* 11. Date Livrare (Code): destinatar + suma contractată.
 * Factura NU se generează aici — Stripe o emite și o trimite clientului,
 * fiindcă rulează ca Merchant of Record. */
add({
  id: 'b7e5a000-0000-4000-8000-000000000011',
  name: 'Date Livrare',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [2240, 300],
  parameters: { mode: 'runOnceForAllItems', jsCode: DATE_LIVRARE.trim() + '\n' }
});

/* 12. Placeholder-e Docs */
add({
  id: 'b7e5a000-0000-4000-8000-000000000014',
  name: 'Placeholder-e Docs',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [2880, 300],
  parameters: { mode: 'runOnceForAllItems', jsCode: PLACEHOLDERE_DOCS }
});

/* 13. Copie Template (Drive) — template-ul NU se modifică niciodată */
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

/* 14. Docs batchUpdate: replaceAllText ×37 pe copie */
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

/* 15. Export PDF (Drive) — responseFormat file → binar */
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

/* 16. Șterge Copia (Drive) — fără gunoi în Drive */
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

/* 17. ZIP Pachet */
add({
  id: 'b7e5a000-0000-4000-8000-000000000019',
  name: 'ZIP Pachet',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [4480, 300],
  parameters: { mode: 'runOnceForAllItems', jsCode: ZIP_PACHET }
});

/* 18. Gmail Livrare ZIP */
add({
  id: 'b7e5a000-0000-4000-8000-000000000020',
  name: 'Gmail Livrare ZIP',
  type: 'n8n-nodes-base.gmail',
  typeVersion: 2.1,
  position: [4800, 300],
  parameters: {
    sendTo: '={{ $json.destinatar }}',
    subject: 'AutoAct — actele tale pentru transcriere auto sunt gata (ZIP)',
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
    content: '\n## INSTALARE — AutoAct Plăți + Documente (Stripe → Docs → ZIP)\n1) n8n → ⋯ → **Import from File** → acest JSON.\n2) **Schema DB:** rulează o dată module-5/plati-schema.sql (docker compose exec -T postgres psql -U autoact -d autoact).\n3) **Env (docker-compose.yml):** STRIPE_WEBHOOK_SECRET, GOOGLE_DOCS_TEMPLATE_CONTRACT / _DRPCIV / _DECLARATII.\n4) **Credentials n8n:** Google OAuth2 (Drive + Docs scope-uri) — nodurile 12–15.\n5) **Stripe:** Developers → Webhooks → endpoint POST ' + STRIPE.WEBHOOK_URL + ', evenimentul checkout.session.completed. Copiază Signing secret în .env ca STRIPE_WEBHOOK_SECRET.\n6) Activează workflow-ul.\n⚠ Facturarea NU e aici: Stripe rulează ca Merchant of Record („Managed Payments”) și emite factura cu TVA direct către client.'
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
    content: '\n### Semnătura Stripe (nodul 2)\nAntetul Stripe-Signature are forma t=<unix>,v1=<hex>.\nSemnătura = HMAC-SHA256(STRIPE_WEBHOOK_SECRET, „<t>.<body>”) peste **octeții exacti** ai body-ului → de aceea nodul Webhook are RAW BODY pornit.\nComparația e cu timingSafeEqual (constantă în timp) și orice antet mai vechi de 300 s e refuzat.\nOrice eșec → răspuns 400, fără alertă admin.\n⚠ Necesită NODE_FUNCTION_ALLOW_BUILTIN=fs,path,crypto (Modulul 3).'
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
    content: '\n### Idempotență pe order_id (nodul 5)\nCTE INSERT ... ON CONFLICT DO NOTHING + UNION fallback → mereu exact 1 rând: duplicat=0 (prima dată) sau duplicat=1 (retransmisie).\nRetransmisiile Stripe mor aici — zero pachete livrate de două ori.\norder_id = client_reference_id pus de Payment Link = id_tranzactie.'
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
    content: '### Generare Documente (nodurile 12–16)\\nTemplate-urile Google Docs NU se modifică niciodată: nodul 13 face o COPIE per document, nodul 14 aplică replaceAllText ×37, nodul 15 exportă PDF, nodul 16 ȘTERGE copia.\\nID-urile șabloanelor vin din env: GOOGLE_DOCS_TEMPLATE_CONTRACT / _DRPCIV / _DECLARATII.\\nZIP-ul (nodul 17) e construit inline (CRC32 + STORE, zero npm).'
  }
});

/* ---------- Conexiuni ---------- */
const next = (name) => [{ node: name, type: 'main', index: 0 }];
const connections = {
  'Webhook Stripe':           { main: [next('Verificare Semnătură')] },
  'Verificare Semnătură':     { main: [next('IF Semnătură Validă')] },
  'IF Semnătură Validă':      { main: [next('Idempotenta (Postgres)'), next('Respond Semnătură Invalidă')] },
  'Idempotenta (Postgres)':   { main: [next('IF Deja Procesată')] },
  'IF Deja Procesată':        { main: [next('Respond Deja Procesată'), next('Data Tranzacție (Postgres)')] },
  'Data Tranzacție (Postgres)': { main: [next('IF Plată Confirmată')] },
  'IF Plată Confirmată':      { main: [next('Date Livrare'), next('Respond Plată Respinsă')] },
  'Date Livrare':             { main: [next('Placeholder-e Docs')] },
  'Placeholder-e Docs':       { main: [next('Copie Template (Drive)')] },
  'Copie Template (Drive)':   { main: [next('Docs batchUpdate')] },
  'Docs batchUpdate':         { main: [next('Export PDF (Drive)')] },
  'Export PDF (Drive)':       { main: [next('Șterge Copia (Drive)')] },
  'Șterge Copia (Drive)':     { main: [next('ZIP Pachet')] },
  'ZIP Pachet':               { main: [next('Gmail Livrare ZIP')] }
};

/* ---------- Asamblare + scriere ---------- */
const workflow = {
  name: 'AutoAct — Plăți Stripe (Merchant of Record) + Documente (v1)',
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
  /* `$` e funcția n8n de acces la ieșirea altor noduri ($('Nod').first()) —
   * fără ea, un nod care o folosește nu ar putea fi simulat deloc. */
  const fn = new AsyncFunction('$json', '$env', 'items', 'require', '$', jsCode);
  return fn.call({ helpers: ctx.helpers || {} }, ctx.$json || {}, ctx.$env || {}, ctx.items || [], ctx.requireMock || REQUIRE_MOCK, ctx.$);
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
  assert(citit.nodes.length === 22, 'JSON valid cu 22 noduri (18 pipeline + 4 sticky) — găsite: ' + citit.nodes.length);

  const numeSet = new Set(citit.nodes.map((n) => n.name));
  let muchii = 0;
  for (const [sursa, con] of Object.entries(citit.connections)) {
    if (!numeSet.has(sursa)) { assert(false, 'sursă inexistentă: ' + sursa); continue; }
    for (const ramura of con.main) for (const tinta of ramura) {
      muchii++;
      if (!numeSet.has(tinta.node)) assert(false, 'țintă inexistentă: ' + tinta.node);
    }
  }
  assert(muchii === 17, '17 muchii în graf (14 liniare + 3 ramuri IF) — găsite: ' + muchii);
  const adiacenta = {};
  for (const [sursa, con] of Object.entries(citit.connections)) {
    adiacenta[sursa] = adiacenta[sursa] || [];
    for (const ramura of con.main) for (const tinta of ramura) adiacenta[sursa].push(tinta.node);
  }
  const vazute = new Set(['Webhook Stripe']);
  const coada = ['Webhook Stripe'];
  while (coada.length) {
    const curent = coada.shift();
    for (const urm of adiacenta[curent] || []) if (!vazute.has(urm)) { vazute.add(urm); coada.push(urm); }
  }
  const pipeline = citit.nodes.filter((n) => n.type !== 'n8n-nodes-base.stickyNote');
  assert(vazute.size === pipeline.length, 'graf conex: ' + vazute.size + '/' + pipeline.length + ' accesibile de la Webhook');

  /* Nodurile Netopia/SmartBill nu mai au ce căuta aici: prezența lor
   * ar însemna o factură dublă sau o ramură moartă în workflow. */
  const numeNodos = citit.nodes.map((n) => n.name).join(' | ');
  assert(!/Netopia|SmartBill|MobilPay/i.test(numeNodos), 'niciun nod Netopia/SmartBill a rămas în workflow');

  /* RAW BODY e condiția de existență a verificării: fără el, hash-ul
   * nu s-ar potrivi niciodată și fiecare plată ar fi respinsă. */
  const nodWebhook = citit.nodes.find((n) => n.name === 'Webhook Stripe');
  assert(nodWebhook.parameters.options.rawBody === true, 'Webhook Stripe: RAW BODY pornit (obligatoriu pentru verificarea semnăturii)');
  assert(nodWebhook.parameters.path === 'stripe', 'Webhook Stripe: calea /webhook/stripe');

  // (b) Ramurile IF pe pozițiile corecte
  const c = citit.connections;
  assert(c['IF Semnătură Validă'].main[0][0].node === 'Idempotenta (Postgres)' && c['IF Semnătură Validă'].main[1][0].node === 'Respond Semnătură Invalidă', 'IF Semnătură: true→Postgres, false→400');
  assert(c['IF Deja Procesată'].main[0][0].node === 'Respond Deja Procesată' && c['IF Deja Procesată'].main[1][0].node === 'Data Tranzacție (Postgres)', 'IF Deja: true→duplicat, false→Data Tranzacție');
  assert(c['IF Plată Confirmată'].main[0][0].node === 'Date Livrare' && c['IF Plată Confirmată'].main[1][0].node === 'Respond Plată Respinsă', 'IF Plată: true→Date Livrare, false→respins');
  assert(c['Date Livrare'].main[0][0].node === 'Placeholder-e Docs' && c['ZIP Pachet'].main[0][0].node === 'Gmail Livrare ZIP', 'lanț: Livrare→Docs→...→ZIP→Gmail');
  assert(citit.nodes.find((n) => n.name === 'Respond Semnătură Invalidă').parameters.options.responseCode === 400, 'semnătură invalidă → HTTP 400');

  /* Prețul trebuie să fie exact cel din config.js — o cifră scrisă în
   * workflow ar însemna o plată acceptată la altă sumă decât cea site. */
  const conds = citit.nodes.find((n) => n.name === 'IF Plată Confirmată').parameters.conditions.conditions;
  const condSuma = conds.find((x) => x.id === 'c-suma');
  assert(condSuma.rightValue === PRET_RON, 'IF Plată Confirmată: suma comparată cu prețul din config.js (' + PRET_RON + ' RON)');
  const condMoneda = conds.find((x) => x.id === 'c-moneda');
  assert(!!condMoneda && condMoneda.rightValue === 'RON', 'IF Plată Confirmată: se verifică și moneda (RON), nu doar suma');

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

  /* (d) Semnătura Stripe — simulare REALĂ, cu require('crypto') adevărat.
   * Nu verificăm doar „merge": verificăm și că fiecare sabotaj posibil
   * e respins. Un webhook care acceptă un corp modificat ar lăsa orice
   * persoană să declanșeze generarea documentelor fără plată. */
  const crypto = require('crypto');
  const SECRET = 'whsec_test_0123456789abcdef';
  const nodSemn = citit.nodes.find((n) => n.name === 'Verificare Semnătură');
  const ENV = { STRIPE_WEBHOOK_SECRET: SECRET };
  const codSemn = nodSemn.parameters.jsCode;
  /* crypto trebuie permis explicit în simulare, ca în n8n (NODE_FUNCTION_ALLOW_BUILTIN) */
  assert(/require\('crypto'\)/.test(codSemn), 'nodul de semnătură folosește crypto nativ (nu un algoritm scris cu ochiul)');
  assert(/timingSafeEqual/.test(codSemn), 'compararea semnăturii e cu timingSafeEqual (constantă în timp)');
  assert(!/\.digest\('hex'\)\s*(!==|===|==)/.test(codSemn) && !/a\s*!==\s*b/.test(codSemn.replace(/\/\*[\s\S]*?\*\//g, '')),
    'semnătura nu e comparată cu != / === pe șiruri (comparare în timp variabil)');

  function antetStripe(payload, secret, ts) {
    const t = ts || Math.floor(Date.now() / 1000);
    const v1 = crypto.createHmac('sha256', secret).update(t + '.' + payload, 'utf8').digest('hex');
    return { t, antet: 't=' + t + ',v1=' + v1 };
  }
  function evenimentStripe(over) {
    return JSON.stringify(Object.assign({
      id: 'evt_1AbCdEfGhIjKlMnOp',
      type: 'checkout.session.completed',
      data: { object: {
        client_reference_id: 'tr_ab12cd34ef56ab12',
        amount_total: PRET_RON * 100,
        currency: 'ron',
        payment_status: 'paid',
        customer_details: { email: 'cumparator2@example.com' }
      } }
    }, over || {}));
  }
  async function ruleazaSemnatura(payload, antet, env) {
    const out = await simuleaza(codSemn, {
      $json: { body: Buffer.from(payload, 'utf8'), headers: { 'stripe-signature': antet } },
      $env: env || ENV,
      requireMock: require
    });
    return out[0].json;
  }

  const payloadBun = evenimentStripe();
  const hBun = antetStripe(payloadBun, SECRET);
  const ok = await ruleazaSemnatura(payloadBun, hBun.antet);
  assert(ok.semnatura_ok === true && ok.order_id === 'tr_ab12cd34ef56ab12',
    'Semnătură validă acceptată + order_id (client_reference_id) extras');
  assert(ok.suma === PRET_RON && ok.moneda === 'RON',
    'Suma e normalizată din unități mici în lei (' + PRET_RON + ' RON), nu 4900');
  assert(ok.status === 'confirmed', 'eveniment checkout.session.completed + paid → status confirmed');

  const hFals = antetStripe(payloadBun, 'whsec_test_altsemnatURAAA');
  const fals = await ruleazaSemnatura(payloadBun, hFals.antet);
  assert(fals.semnatura_ok === false && fals.motiv === 'semnatura_invalida',
    'semnătură calculată cu alt secret → respinsă (' + fals.motiv + ')');

  const hOk = antetStripe(payloadBun, SECRET);
  const corpModificat = await ruleazaSemnatura(payloadBun.replace('"paid"', '"unpaid"'), hOk.antet);
  assert(corpModificat.semnatura_ok === false,
    'corp modificat cu antet valid → respins (de aceea semnătura e pe octeții exacti, nu pe obiectul parsat)');

  const hVechi = antetStripe(payloadBun, SECRET, Math.floor(Date.now() / 1000) - 3600);
  const vechi = await ruleazaSemnatura(payloadBun, hVechi.antet);
  assert(vechi.semnatura_ok === false && vechi.motiv === 'semnatura_expirata',
    'antet vechi de o oră (body capturat) → respins (' + vechi.motiv + ')');

  const faraSemnatura = await ruleazaSemnatura(payloadBun, '');
  assert(faraSemnatura.semnatura_ok === false && faraSemnatura.motiv === 'antet_invalid',
    'fără antet Stripe-Signature → respins (' + faraSemnatura.motiv + ')');

  const faraSecret = await ruleazaSemnatura(payloadBun, hBun.antet, {});
  assert(faraSecret.semnatura_ok === false && faraSecret.motiv === 'secret_lipsa',
    'STRIPE_WEBHOOK_SECRET neconfigurat → respins, nu „acceptat orbește" (' + faraSecret.motiv + ')');

  const outParsat = await simuleaza(codSemn, {
    $json: { body: JSON.parse(payloadBun), headers: { 'stripe-signature': hBun.antet } },
    $env: ENV, requireMock: require
  });
  assert(outParsat[0].json.semnatura_ok === false && outParsat[0].json.motiv === 'body_raw_lipsa',
    'body parsat în loc de raw → respins (nu se „reconstruiește" un hash din obiect)');

  const payloadFaraRef = evenimentStripe({
    data: { object: { amount_total: PRET_RON * 100, currency: 'ron', payment_status: 'paid' } }
  });
  const faraRef = await ruleazaSemnatura(payloadFaraRef, antetStripe(payloadFaraRef, SECRET).antet);
  assert(faraRef.semnatura_ok === true && faraRef.fara_tranzactie === true,
    'plată fără client_reference_id → semnătură OK dar marcată fără tranzacție (IF-ul o respinge)');

  // (e) Simulare nodul 11 (Placeholder-e Docs) pe profilul din Test Data Kit
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

  // (f) Simulare lanț 12→16: expresii reale + ZIP pe PDF-uri fake
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
  /* Simularea reproduce cea mai incomodă realitate: nodurile HTTP Drive
   * (Copie → batchUpdate → Export → Șterge) înlocuiesc $json cu răspunsul
   * lor, deci items[].json NU mai conține destinatarul sau numele fișierului.
   * De aceea ZIP-ul le ia din lista canonică și din nodul „Date Livrare" —
   * și simularea de mai jos ar trebui să CADĂ dacă s-ar întoarce la items[]. */
  const LIVRARE = {
    id_tranzactie: profil.id_tranzactie,
    destinatar: 'cumparator2@example.com',
    nume_client: kit[1].nume_fictiv
  };
  /* Ieșirea nodului „Export PDF (Drive)": 3 itemi, fiecare CU binar.
   * Ieșirea nodului „Șterge Copia (Drive)" (ce sosește în ZIP prin items) e
   * răspunsul DELETE — fără binar, pentru că un nod HTTP Request înlocuiește
   * itemul. Simularea reproduce exact această realitate. */
  const exportate = ['01-contract-vanzare-cumparare', '02-cerere-drpciv', '03-declaratii-fiscale'].map((nume, i) => ({
    json: { documentId: 'COPIE_' + i },
    binary: { data: { data: Buffer.from('%PDF-1.7\n' + 'X'.repeat(1000 + i * 500)).toString('base64'), mimeType: 'application/pdf' } }
  }));
  const fakePdfs = exportate.map(() => ({ json: { /* răspuns DELETE: fără binar */ ok: true } }));
  /* getBinaryDataBuffer aruncă: ZIP-ul NU trebuie să caute binare în items,
   * pentru că acolo nodul DELETE le-a pierdut. Dacă reintroduce această
   * dependență, simularea o prinde imediat. */
  const helpersZip = {
    getBinaryDataBuffer: async () => { throw new Error('ZIP nu trebuie să citească binare din items — nodul DELETE le-a pierdut'); },
    prepareBinaryData: async (buf, nume) => ({ data: buf.toString('base64'), fileName: nume, mimeType: 'application/zip' })
  };
  const $mock = (nume) => {
    if (nume === 'Export PDF (Drive)') return { all: () => exportate };
    if (nume === 'Date Livrare') return { first: () => ({ json: LIVRARE }) };
    throw new Error('nod necunoscut în expresie: ' + nume);
  };
  const outZip = await simuleaza(nodZip.parameters.jsCode, { items: fakePdfs, helpers: helpersZip, $json: {}, $env: {}, $: $mock });
  const zipBuf = Buffer.from(outZip[0].binary.data.data, 'base64');
  assert(zipBuf.readUInt32LE(0) === 0x04034b50 && zipBuf.readUInt32LE(zipBuf.length - 22) === 0x06054b50, 'ZIP Pachet: semnăturile PK local header + EOCD prezente');
  const eocdCount = zipBuf.readUInt16LE(zipBuf.length - 22 + 10);
  assert(eocdCount === 3, 'ZIP Pachet: 3 intrări în arhivă — obținute: ' + eocdCount);

  /* Nume de fișier: din lista canonică, nu din răspunsul Drive. */
  assert(zipBuf.includes(Buffer.from('01-contract-vanzare-cumparare.pdf', 'utf8')),
    'ZIP Pachet: numele PDF-urilor vin din lista canonică (nu din răspunsul Drive, care le-a pierdut)');
  assert(zipBuf.includes(Buffer.from('02-cerere-drpciv.pdf', 'utf8')) && zipBuf.includes(Buffer.from('03-declaratii-fiscale.pdf', 'utf8')),
    'ZIP Pachet: toate cele 3 nume canonice apar în arhivă');
  /* Conținutul: primul PDF exportat trebuie să fie primul în arhivă. */
  /* indexOf dă poziția NUMELUI în arhivă; datele urmează imediat după el
   * (30 de octeți de local header au fost deja adăugate la offset). */
  const numePrima = '01-contract-vanzare-cumparare.pdf';
  const offsetNume = zipBuf.indexOf(Buffer.from(numePrima, 'utf8'));
  const continutPrima = zipBuf.subarray(offsetNume + Buffer.byteLength(numePrima, 'utf8'));
  assert(continutPrima.subarray(0, 8).toString() === '%PDF-1.7',
    'ZIP Pachet: conținutul e PDF-ul exportat, citit din nodul Export PDF (nu din items, unde nodul DELETE l-a pierdut)');
  assert(outZip[0].json.destinatar === 'cumparator2@example.com' && outZip[0].json.nume_client === kit[1].nume_fictiv,
    'ZIP Pachet: destinatarul și numele vin din nodul Date Livrare (nu din items[].json)');
  assert(outZip[0].binary.data.fileName === profil.id_tranzactie + '.zip',
    'ZIP Pachet: arhiva se numește după tranzacție — obținut: ' + outZip[0].binary.data.fileName);

  /* Fără Date Livrare, ZIP-ul nu se construiește — livrăm doar dacă ajunge. */
  let faraLivrare = '';
  try {
    await simuleaza(nodZip.parameters.jsCode, {
      items: fakePdfs, helpers: helpersZip, $json: {}, $env: {},
      $: (nume) => {
        if (nume === 'Export PDF (Drive)') return { all: () => exportate };
        return { first: () => ({ json: {} }) };
      }
    });
  } catch (e) { faraLivrare = e.message; }
  assert(/destinatar/i.test(faraLivrare), 'ZIP Pachet: fără destinatar se oprește, nu livrează un ZIP fără cineva');

  /* Exportul incomplet (un document lipsă sau răspuns neașteptat) se oprește
   * înainte de a arde creditele Google pe un ZIP cu 2 de 3 fișiere. */
  let exportIncomplet = '';
  try {
    await simuleaza(nodZip.parameters.jsCode, {
      items: fakePdfs, helpers: helpersZip, $json: {}, $env: {},
      $: (nume) => {
        if (nume === 'Export PDF (Drive)') return { all: () => exportate.slice(0, 2) };
        return { first: () => ({ json: LIVRARE }) };
      }
    });
  } catch (e) { exportIncomplet = e.message; }
  assert(/2 fișiere/i.test(exportIncomplet),
    'ZIP Pachet: export incomplet (2 din 3) se oprește, nu arhivează un pachet lacună');

  /* (g) Date Livrare: destinatarul se ia din plată când dosarul nu-l are,
   * iar fără adresă fluxul se oprește cu un mesaj explicit (nu livrăm
   * un ZIP fără destinatar și nu cheltuim creditele Google pe nimic). */
  const nodLivrare = citit.nodes.find((n) => n.name === 'Date Livrare');
  const randLivrare = { id_tranzactie: profil.id_tranzactie, nume_cumparator: kit[1].nume_fictiv, email_cumparator: '', email_plata: 'cumparator2@example.com' };
  const outLivrare = await simuleaza(nodLivrare.parameters.jsCode, { $json: randLivrare, $env: {}, items: [] });
  assert(outLivrare[0].json.destinatar === 'cumparator2@example.com' && outLivrare[0].json.nume_client === kit[1].nume_fictiv,
    'Date Livrare: destinatarul vine din evenimentul Stripe când dosarul nu are e-mail');
  assert(outLivrare[0].json.suma_plata === PRET_RON && outLivrare[0].json.tva_inclus === true && outLivrare[0].json.factura_emisa_de === 'stripe',
    'Date Livrare: suma e cea contractată, TVA inclus, factura e a Stripe');
  const prioritare = await simuleaza(nodLivrare.parameters.jsCode, {
    $json: { email_cumparator: 'din-dosar@example.com', email_plata: 'de-la-plata@example.com' }, $env: {}, items: []
  });
  assert(prioritare[0].json.destinatar === 'din-dosar@example.com',
    'Date Livrare: e-mailul din dosar are prioritate (dosarul e sursa completată de client)');
  let faraEmail = '';
  try {
    await simuleaza(nodLivrare.parameters.jsCode, { $json: { email_cumparator: '', email_plata: '' }, $env: {}, items: [] });
  } catch (e) { faraEmail = e.message; }
  assert(/e-mail/i.test(faraEmail), 'Date Livrare: fără niciun e-mail → eroare explicită, nu un e-mail livrat în gol');

  console.log('');
  console.log('Output: ' + OUT);
  console.log(esecuri === 0 ? 'TOATE VALIDĂRILE AU TRECUT ✔' : esecuri + ' VALIDĂRI EȘUATE ✘');
  process.exit(esecuri === 0 ? 0 : 1);
})().catch((e) => {
  console.error('EROARE VALIDARE:', e && e.message ? e.message : e);
  process.exit(1);
});