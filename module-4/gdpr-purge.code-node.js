/* ============================================================
 * AutoAct | Modulul 4 | gdpr-purge.code-node.js
 * Varianta nod "Code" n8n: curăță FIZIC fișierele de pe disc,
 * în completarea gdpr-purge.sql (care curăță DB).
 *
 * Ce face:
 *   1. șterge recursiv directoarele tranzacțiilor epurate:
 *      /home/node/local/{id_tranzactie}/
 *   2. șterge orice ZIP/PDF orfan mai vechi de 48 h din /home/node/local/
 *   3. returnează un raport JSON (pentru e-mailul de audit zilnic)
 *
 * Programare: nod Schedule Trigger (0 4 * * *)
 *   → nod PostgreSQL (gdpr-purge.sql) → ACEST nod Code → nod Gmail (audit)
 *
 * Cerință: NODE_FUNCTION_ALLOW_BUILTIN=fs,path (deja setat în Modulul 3).
 * ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT_LOCAL = '/home/node/local';
const PRAG_ORE_FISIERE_LIVRATE = 48;
const PRAG_ORE_ORFANE = 48;

function stergeRecursiv(cale) {
  try {
    fs.rmSync(cale, { recursive: true, force: true });
    return true;
  } catch (e) {
    return { eroare: String(e && e.message ? e.message : e) };
  }
}

function vechimeOre(mtimeMs) {
  return (Date.now() - mtimeMs) / 3600000;
}

// 1. Directoarele tranzacțiilor epurate (primite din pasul SQL anterior,
//    nodul PostgreSQL: SELECT id_tranzactie FROM tranzactii WHERE stare='epirat_gdpr' AND epirat_la > NOW() - INTERVAL '5 minutes')
const iduriEpurate = new Set(
  (items || [])
    .map((it) => it.json && (it.json.id_tranzactie || it.json.tranzactie_id))
    .filter(Boolean)
);

const raport = {
  rulat_la: new Date().toISOString(),
  directoare_sterse: [],
  fisiere_orfane_sterse: [],
  erori: []
};

if (fs.existsSync(ROOT_LOCAL)) {
  for (const intrare of fs.readdirSync(ROOT_LOCAL, { withFileTypes: true })) {
    const cale = path.join(ROOT_LOCAL, intrare.name);

    if (intrare.isDirectory()) {
      // director = id_tranzactie (ex: tr_ab12cd34ef56ab12)
      if (iduriEpurate.has(intrare.name)) {
        const rez = stergeRecursiv(cale);
        if (rez === true) raport.directoare_sterse.push(intrare.name);
        else raport.erori.push({ cale, ...rez });
      }
      continue;
    }

    // 2. fișiere orfane (ZIP-uri/PDF-uri fără director-părinte activ)
    try {
      const stat = fs.statSync(cale);
      if (stat.isFile() && vechimeOre(stat.mtimeMs) > PRAG_ORE_ORFANE) {
        fs.rmSync(cale, { force: true });
        raport.fisiere_orfane_sterse.push(intrare.name);
      }
    } catch (e) {
      raport.erori.push({ cale, eroare: String(e && e.message ? e.message : e) });
    }
  }
} else {
  raport.erori.push({ cale: ROOT_LOCAL, eroare: 'directorul local nu există (volumul nu e montat?)' });
}

// 3. Rezumat pentru e-mailul de audit (nodul Gmail de după)
return [
  {
    json: {
      subiect_resumat: `GDPR disc-purge: ${raport.directoare_sterse.length} directoare, ${raport.fisiere_orfane_sterse.length} fișiere orfane, ${raport.erori.length} erori`,
      ...raport
    }
  }
];
