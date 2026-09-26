/* AutoAct | site | demo-data.js
 * Răspuns DEMO identic structural cu JSON-ul nodului „Fallback Client"
 * din module-2/autoact-workflow.json. Datele sunt fictive (Test Data Kit,
 * module-1/test-data-kit.json). Deschide ecranul Zero-Refund fără server.
 */
window.AUTOACT_DEMO = {
  status: 'corectii_necesare',
  id_tranzactie: 'tr_demo0000000001',
  scor_calitate: 92,
  cnp_valid_tot: true,
  cnp_erori: [],
  campuri_nesigure: ['date_vanzator.adresa', 'date_vehicul.odometru_km'],
  url_plata: null,
  mesaj_client: 'Unele date nu au trecut validarea. Corectează câmpurile evidențiate pe ecranul de pre-vizualizare și retrimite.',
  date: {
    date_vanzator: {
      nume_complet: 'Popescu Andrei-Ionut',
      cnp: '1750314411231',
      serie_ci: 'RX',
      numar_ci: '123456',
      adresa: 'Str. Libertatii nr. 12, bl. A2, ap. 7',
      localitate: 'Bucuresti (Sector 1)',
      judet: 'Bucuresti Sector 1'
    },
    date_cumparator: {
      nume_complet: 'Marinescu Elena-Roxana',
      cnp: '6010902122043',
      serie_ci: 'YA',
      numar_ci: '234567',
      adresa: 'Calea Turzii nr. 88',
      localitate: 'Cluj-Napoca',
      judet: 'Cluj'
    },
    date_vehicul: {
      marca: 'Dacia',
      model: 'Logan',
      vin: 'VF1RFA00567890123',
      numar_inmatriculare: 'B-123-ABC',
      an_fabricatie: 2016,
      cilindree_cm: 1461,
      putere_kw: 55,
      masa_maxima_kg: 1730,
      odometru_km: 154000,
      tip_combustibil: 'motorina'
    },
    date_tranzactie: {
      suma_ron: 9500,
      data_vanzarii: '2026-09-26',
      localitate_incheiere: 'Bucuresti',
      scutire_taxa_sub_24_luni: false
    }
  }
};
