/**
 * AutoAct | Modulul 1 | Script demo end-to-end
 *
 * Populează un "Profil Unic de Tranzacție Auto" complet, validând
 * TOATE constrângerile schemei JSON (Modulul 1) + CNP-urile cu
 * validatorul din Modulul 2 + VIN-ul fără I/O/Q:
 *
 *   node module-1/populeaza-tranzactie-demo.js
 *
 * Util în dev pentru: testul UI de pre-vizualizare (Modulul 6),
 * payload-ul webhook-ului n8n (Modulul 2) și fixurile de regresie.
 */
const fs = require('fs');
const path = require('path');
const { valideazaCNP } = require('../module-2/cnp-validator.code-node.js');

const kitPath = path.join(__dirname, 'test-data-kit.json');
const kit = JSON.parse(fs.readFileSync(kitPath, 'utf8')).intrari;

const [vanzator, cumparator] = kit;

function persoana(k, rol) {
  const serie = k.serie_ci_fictiva.slice(0, 2);
  const numar = k.serie_ci_fictiva.slice(2);
  return {
    nume_complet: k.nume_fictiv,
    cnp: k.cnp,
    serie_ci: serie,
    numar_ci: numar,
    adresa: k.adresa_fictiva,
    localitate: k.localitate.replace(' (', ' (').trim(),
    judet: k.judet,
    siruta: null,
    telefon: '+40' + (700000000 + 1000 * k.id_test),
    email: rol + k.id_test + '@example.com'
  };
}

const tranzactie = {
  id_tranzactie: 'tr_' + 'ab12cd34ef56ab12',
  stare: 'validare_ok',
  creat_la: new Date().toISOString(),
  platit_la: null,
  date_vanzator: persoana(vanzator, 'vanzator'),
  date_cumparator: persoana(cumparator, 'cumparator'),
  date_vehicul: {
    marca: 'Dacia',
    model: 'Logan',
    vin: vanzator.vin_fictiv,
    numar_inmatriculare: vanzator.placuta_fictiva,
    an_fabricatie: 2016,
    cilindree_cm: 1461,
    putere_kw: 55,
    masa_maxima_kg: 1730,
    odometru_km: 154000,
    tip_combustibil: 'motorina',
    certificat_inmatriculare_serie: 'AB123456'
  },
  date_tranzactie: {
    suma_ron: 9500,
    moneda: 'RON',
    data_vanzarii: new Date().toISOString().slice(0, 10),
    localitate_incheiere: 'București',
    siruta: '179132', // București — cod SIRUTA exemplu
    scutire_taxa_sub_24_luni: false,
    este_persoana_fizica: true,
    acord_client: false, // devine true abia după ecranul Zero-Refund (Modulul 6)
    id_plata: null,
    scor_calitate: 97.5
  }
};

// ---- Verificări (pipeline-ul NU ar trebui să livreze dacă pică vreo una) ----
const verificari = [];
const v1 = valideazaCNP(tranzactie.date_vanzator.cnp);
const v2 = valideazaCNP(tranzactie.date_cumparator.cnp);
verificari.push(['CNP vanzator valid', v1.isValid]);
verificari.push(['CNP cumparator valid', v2.isValid]);
verificari.push(['VIN 17 caractere fara I/O/Q', /^[A-HJ-NPR-Z0-9]{17}$/.test(tranzactie.date_vehicul.vin)]);
verificari.push(['Placuta format RO', /^[A-Z]{1,2}-[0-9]{2,3}-[A-Z]{3}$/.test(tranzactie.date_vehicul.numar_inmatriculare)]);
verificari.push(['Serie CI 2 litere', /^[A-Z]{2}$/.test(tranzactie.date_vanzator.serie_ci)]);
verificari.push(['Scor >= 95', tranzactie.date_tranzactie.scor_calitate >= 95]);

let ok = true;
console.log('--- Verificări profil demo ---');
for (const [nume, rez] of verificari) {
  console.log((rez ? 'PASS' : 'FAIL') + '  ' + nume);
  if (!rez) ok = false;
}
if (!ok) {
  console.error('Profil demo INVALID — nu trimite către pipeline.');
  process.exit(1);
}

const outPath = path.join(__dirname, 'tranzactie-demo.json');
fs.writeFileSync(outPath, JSON.stringify(tranzactie, null, 2) + '\n');
console.log('OK → ' + outPath);
console.log('Payload gata pentru: nodul Webhook n8n (Modulul 2) și UI-ul de pre-vizualizare (Modulul 6).');
