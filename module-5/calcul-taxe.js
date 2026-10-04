/* ============================================================
 * AutoAct | module-5/calcul-taxe.js
 * ============================================================
 * Cât rămâne în mână din 49 lei, după Stripe și după stat.
 *
 * Răspunde la întrebarea care se pune la fiecare comandă: „îmi mai
 * rămâne ceva?". Nu e un estimate — are fiecare prag de lege scris
 * dedesubt, cu sursa, ca să poată fi verificat și corectat când se
 * schimbă legea.
 *
 *   node module-5/calcul-taxe.js              → 100 și 500 comenzi
 *   node module-5/calcul-taxe.js 250          → doar 250 comenzi
 *
 * NU e consultanță fiscală. E o foaie de calcul pe cifrele publice,
 * ca fondatorul să vadă ordinul de mărime înainte să scrie contabilului.
 * ============================================================ */
'use strict';

const C = require('../config-autoact.js');

/* ---------- Ce intră în calcul ---------- */

const PRET_BRUT_CU_TVA = C.PRET_RON; /* 49 lei, TVA inclus */
const TVA = 0.19; /* Romania, 2026 */

/* Tarife Stripe Romania, de pe stripe.com/ro/pricing (verificat 4 oct. 2026):
 *   - carduri EEA standard: 1,5% + 1,00 lei
 *   - carduri EEA premium: 2,8% + 1,00 lei
 *   - carduri internationale: 3,15% + 1,00 lei (+ 2% conversie)
 *   - Managed Payments: +3,5% peste tarifele de mai sus (daca se activeaza) */
const STRIPE_CARD_EEA = { procent: 0.015, fix: 1.0 };
const STRIPE_CARD_PREMIUM = { procent: 0.028, fix: 1.0 };
const STRIPE_MANAGED_PAYMENTS = 0.035;

/* Praguri fiscale 2026. ATENTIE la sursa de confuzie:
 * salariul minim brut a crescut la 4.325 lei de la 1 iulie 2026, dar
 * pentru contributiile datorate de persoanele cu venituri din activitati
 * independente se foloseste salariul minim din PRIMA PARTE a anului:
 * 4.050 lei. Sursa: contapp.ro/blog/pfa-sau-srl („Attention la o gresala
 * care circula"). Deci plafonele raman valabile tot anul 2026. */
const SALARIU_MINIM_REF = 4050;

const PRAG_CASS_MINIM = 6 * SALARIU_MINIM_REF; /* 24.300 lei */
const PRAG_CAS = 12 * SALARIU_MINIM_REF; /* 48.600 lei */
const PRAG_CAS_AL_DOILEA = 24 * SALARIU_MINIM_REF; /* 97.200 lei */
const PLAFON_CASS_MAXIM = 72 * SALARIU_MINIM_REF; /* 291.600 lei */

const COTA_IMPOZIT = 0.1; /* impozit pe venit */
const COTA_CASS = 0.1; /* CASS */
const COTA_CAS = 0.25; /* CAS */

/* TVA: pragul de la care devii platitor. Sub el, TVA-ul incasat nu se
 * returneaza — nu esti platitor, deci e doar venit fiscal al statului. */
const PRAG_TVA = 88500; /* regim normal, 2026 */

/* ---------- Aritmetica ---------- */

const r2 = (n) => Math.round(n * 100) / 100;
const bani = (n) => r2(n).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' lei';

function comisioaneStripe(comenzi, { premium = false, managedPayments = false } = {}) {
  const t = premium ? STRIPE_CARD_PREMIUM : STRIPE_CARD_EEA;
  const brut = comenzi * PRET_BRUT_CU_TVA;
  const card = brut * t.procent + comenzi * t.fix;
  const mp = managedPayments ? brut * STRIPE_MANAGED_PAYMENTS : 0;
  return { card, mp, total: card + mp };
}

/* CASS: 10% din venitul net, dar baza nu poate fi sub 6 salarii minime
 * (24.300 lei) nici peste 72 de salarii. */
function cass(venitNet) {
  const baza = Math.min(Math.max(venitNet, PRAG_CASS_MINIM), PLAFON_CASS_MAXIM);
  return { baza, suma: baza * COTA_CASS };
}

/* CAS: 0 sub 12 salarii; 25% din baza plafonata la 12 salarii pana la 24
 * de salarii; 25% din venit peste 24 de salarii. */
function cas(venitNet) {
  if (venitNet <= PRAG_CAS) return { baza: 0, suma: 0, motiv: 'sub 12 salarii minime (48.600 lei)' };
  if (venitNet <= PRAG_CAS_AL_DOILEA) {
    return { baza: PRAG_CAS, suma: PRAG_CAS * COTA_CAS, motiv: 'platou la 12 salarii minime' };
  }
  return { baza: venitNet, suma: venitNet * COTA_CAS, motiv: 'peste 24 de salarii minime' };
}

/* Scenariul PFA, sistem real.
 *
 * `salariat: true` = ești deja angajat cu CAS și CASS plătite integral
 * (norma întreagă). Atunci plafonul minim de CASS NU se mai aplică la
 * PFA: plătești doar 10% din venitul net efectiv, oricât de mic ar fi.
 * Sursa: contapp.ro — „Dacă ai plătit deja CASS ca salariat la cel puțin
 * acest nivel, plătești pentru PFA doar 10% din venitul net efectiv”.
 * Atenție: CAS pentru PFA rămâne integral datorată — faptul că ești
 * salariat NU te scutește de CAS la activitatea independentă. */
function pfa(comenzi, opts, salariat = false) {
  const brut = comenzi * PRET_BRUT_CU_TVA;
  const tva = brut - brut / (1 + TVA);
  const venitFaraTva = brut - tva;

  const com = comisioaneStripe(comenzi, opts);
  /* Comisioanele Stripe se deduce integral: sunt sub plafonul de
   * 19.300 lei/an cu care un neplatitor de TVA isi limiteaza
   * cheltuielile cu TVA cuprinse (HG 844/2015). */
  const venitNet = venitFaraTva - com.total;

  const c = salariat
    ? { baza: venitNet, suma: venitNet * COTA_CASS, plafonMinim: false }
    : cass(venitNet);
  const k = cas(venitNet);
  const impozit = Math.max(0, (venitNet - k.suma - c.suma) * COTA_IMPOZIT);
  const taxe = k.suma + c.suma + impozit;

  return {
    brut, tva, venitFaraTva, comision: com, venitNet,
    cass: c, cas: k, impozit, taxe,
    ramase: venitNet - taxe,
  };
}

/* Scenariul fara PFA: venit declarat ca „alte venituri din activitati
 * economice”. NU se datoreaza CAS, pentru ca nu exista contract de munca
 * si contributii. CASS se calcula la fel, iar impozitul tot 10%.
 *
 * ATENTIE: la 500 de comenzi recurente, declararea ca venit ocazional
 * este riscanta. 500 de tranzactii repetate intr-un an e activitate
 * economica stabila, nu vanzare ocazionala. Varianta de mai jos e
 * calculul TEHNIC — daca se declara asa. */
function alteVenituri(comenzi, opts) {
  const brut = comenzi * PRET_BRUT_CU_TVA;
  const tva = brut - brut / (1 + TVA);
  const venitFaraTva = brut - tva;

  const com = comisioaneStripe(comenzi, opts);
  const venitNet = venitFaraTva - com.total;

  const c = cass(venitNet);
  const impozit = Math.max(0, (venitNet - c.suma) * COTA_IMPOZIT);
  const taxe = c.suma + impozit;

  return { brut, tva, venitFaraTva, comision: com, venitNet, cass: c, cas: { suma: 0 }, impozit, taxe, ramase: venitNet - taxe };
}

/* ---------- Afisare ---------- */

const lei = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 });
const pct = (n) => (n * 100).toFixed(1).replace('.', ',') + '%';

function afiseaza(eticheta, r, comenzi) {
  const peComanda = r.ramase / comenzi;
  console.log('\n' + '='.repeat(74));
  console.log('  ' + eticheta.toUpperCase() + ' — ' + lei.format(comenzi) + ' comenzi x ' + PRET_BRUT_CU_TVA + ' lei');
  console.log('='.repeat(74));
  console.log('  Incasat brut (cu TVA inclus)        ' + lei.format(r.brut) + ' lei');
  console.log('  TVA necuvenit in facturi            ' + lei.format(r.tva) + ' lei');
  console.log('  Venit fara TVA                      ' + lei.format(r.venitFaraTva) + ' lei');
  console.log('  Comisioane Stripe                   -' + lei.format(r.comision.total) + ' lei');
  console.log('    din care carduri EEA              -' + lei.format(r.comision.card) + ' lei');
  if (r.comision.mp > 0) console.log('    din care Managed Payments          -' + lei.format(r.comision.mp) + ' lei');
  console.log('  ---');
  console.log('  Venit net                           ' + lei.format(r.venitNet) + ' lei');
  console.log('  CAS   ' + (r.cas.suma > 0 ? lei.format(r.cas.suma) : '0').padStart(12) + ' lei  (baza ' + lei.format(r.cas.baza || 0) + ')');
  console.log('  CASS  ' + lei.format(r.cass.suma).padStart(12) + ' lei  (baza ' + lei.format(r.cass.baza) +
      (r.cass.plafonMinim === false ? ', fara plafon minim — angajat' : ', plafonata la ' + lei.format(r.cass.baza)) + ')');
  console.log('  Impozit 10%                         ' + lei.format(r.impozit).padStart(12) + ' lei');
  console.log('  ---');
  console.log('  TOTAL DE PLAT stat                  ' + lei.format(r.taxe) + ' lei');
  if (r.ramase < 0) {
    console.log('');
    console.log('  ATENTIE: rezultat negativ. CASS are baza minima de ' + lei.format(PRAG_CASS_MINIM) + ' lei,');
    console.log('  adica platesti ' + lei.format(PRAG_CASS_MINIM * COTA_CASS) + ' lei CASS chiar daca ai');
    console.log('  venit mai mic de atat. La acest nivel, comisionul Stripe si CASS-ul');
    console.log('  consuma tot ce ai incasat. Nu se lucreaza asa.');
  }

  console.log('  RAMANE IN MANA                      ' + lei.format(r.ramase) + ' lei');
  console.log('  pe comanda                          ' + bani(peComanda) + '  (' + pct(r.ramase / r.brut) + ' din incasat)');
  console.log('  ca procent din venitul fara TVA     ' + pct(r.ramase / r.venitFaraTva));
}

const argumente = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n) && n > 0);
const comenziList = argumente.length ? argumente : [100, 500];

console.log('\nAUTOACT — calcul taxe la ' + PRET_BRUT_CU_TVA + ' lei/comanda');
console.log('Salariu minim de referinta 2026: ' + lei.format(SALARIU_MINIM_REF) + ' lei (nu 4.325 — vezi nota din cod)');
console.log('Prag CASS minim: ' + lei.format(PRAG_CASS_MINIM) + ' lei | Prag CAS: ' + lei.format(PRAG_CAS) + ' lei');

for (const n of comenziList) {
  const standard = pfa(n, {});
  afiseaza('PFA, sistem real, NEangajat (CASS de la zero)', standard, n);

  const angajat = pfa(n, {}, true);
  console.log('\n  --- daca esti ANGAJAT cu CAS+CASS la norma intreaga ---');
  console.log('  CASS: ' + lei.format(angajat.cass.suma) + ' lei in loc de ' + lei.format(standard.cass.suma) +
    '  (fara plafonul minim de ' + lei.format(PRAG_CASS_MINIM) + ' lei)');
  console.log('  Impozit: ' + lei.format(angajat.impozit) + ' lei in loc de ' + lei.format(standard.impozit));
  console.log('  Total taxe: ' + lei.format(angajat.taxe) + ' lei in loc de ' + lei.format(standard.taxe));
  console.log('  RAMANE: ' + lei.format(angajat.ramase) + ' lei in loc de ' + lei.format(standard.ramase));
  console.log('  pe comanda: ' + bani(angajat.ramase / n));
  console.log('  (CAS ramane integral datorata — angajatul NU te scutea de CAS la PFA)');

  if (n >= 500) {
    const cuMP = pfa(n, { managedPayments: true });
    console.log('\n  --- varianta cu Managed Payments (comision +3,5%) ---');
    console.log('  Comisioane Stripe: ' + lei.format(cuMP.comision.total) + ' lei in loc de ' + lei.format(standard.comision.total) + ' lei');
    console.log('  Total taxe: ' + lei.format(cuMP.taxe) + ' lei (fata de ' + lei.format(standard.taxe) + ')');
    console.log('  Ramane: ' + lei.format(cuMP.ramase) + ' lei (fata de ' + lei.format(standard.ramase) + ')');

    const faraPFA = alteVenituri(n, {});
    console.log('\n  --- fara PFA, declarat ca „alte venituri” (tehnic, riscant) ---');
    console.log('  Total taxe: ' + lei.format(faraPFA.taxe) + ' lei | Ramane: ' + lei.format(faraPFA.ramase) + ' lei');
    console.log('  Diferenta fata de PFA: ' + lei.format(faraPFA.taxe - standard.taxe) + ' lei');
  }
}

console.log('\n' + '='.repeat(74));
console.log('ATENTIE:');
console.log(' - Sub ' + lei.format(PRAG_TVA) + ' lei/an nu te declari platitor de TVA, dar nici');
console.log('   nu returnezi TVA-ul. Pretul de ' + PRET_BRUT_CU_TVA + ' lei contine TVA de ~' +
  lei.format(PRET_BRUT_CU_TVA - PRET_BRUT_CU_TVA / (1 + TVA)) + ' lei pe comanda.');
console.log(' - CASS are baza minima de ' + lei.format(PRAG_CASS_MINIM) + ' lei: chiar si sub');
console.log('   acest venit platesti ' + lei.format(PRAG_CASS_MINIM * COTA_CASS) + ' lei. Daca esti');
console.log('   deja ANGAJAT cu CASS la norma intreaga, platesti doar 10% din venitul');
console.log('   net efectiv, fara acest plafon — deci scenariul de mai sus e cel bun.');
console.log(' - Aceste cifre nu sunt consultanta fiscala. Legea se schimba si poate');
console.log('   contesta interpretarea. Le aratai contabilului inainte de decizie.');
console.log('='.repeat(74) + '\n');