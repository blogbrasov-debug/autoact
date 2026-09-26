/* ============================================================
 * AutoAct | Module 2 – Pas 4 | Validator matematic CNP
 * JavaScript pur, pregătit pentru nodul n8n "Code" (self-hosted).
 *
 * Algoritm național:
 *   - Cheia standard: 279146358279
 *   - Primele 12 cifre se înmulțesc, poziție cu poziție, cu cheia.
 *   - Se adună produsele, se ia restul împărțirii la 11.
 *   - Dacă restul == 10 → cifra de control = 1, altfel cifra de control = restul.
 *   - Se compară cu a 13-a cifră a CNP-ului.
 * Validări suplimentare: format 13 cifre, S ∈ 1–6, dată reală (incl. ani
 * bisecți), JJ ∈ 01–52.
 * ============================================================ */

function valideazaCNP(cnp) {
  const out = { cnp: String(cnp == null ? '' : cnp), isValid: false, erori: [], meta: null };

  if (!/^[0-9]{13}$/.test(out.cnp)) {
    out.erori.push('CNP invalid: trebuie să fie un string de exact 13 cifre.');
    return out;
  }

  const cifre = out.cnp.split('').map(Number);
  const S = cifre[0];
  const an = (S === 1 || S === 2 ? 1900 : S === 3 || S === 4 ? 1800 : 2000) + parseInt(out.cnp.slice(1, 3), 10);
  const luna = parseInt(out.cnp.slice(3, 5), 10);
  const zi = parseInt(out.cnp.slice(5, 7), 10);
  const judet = parseInt(out.cnp.slice(7, 9), 10);

  if (S < 1 || S > 6) out.erori.push('Prima cifră (S) este în afara intervalului 1–6.');

  const d = new Date(an, luna - 1, zi);
  const dataReal = d.getFullYear() === an && d.getMonth() === luna - 1 && d.getDate() === zi;
  if (!dataReal) out.erori.push('Data de naștere (AA/LL/ZZ) nu există în calendar.');

  if (judet < 1 || judet > 52) out.erori.push('Codul de județ (JJ) trebuie să fie 01–52.');

  if (out.erori.length > 0) return out;

  const CHEIE = '279146358279'.split('').map(Number);
  let suma = 0;
  for (let i = 0; i < 12; i++) suma += cifre[i] * CHEIE[i];
  const rest = suma % 11;
  const cifraControl = rest === 10 ? 1 : rest;

  if (cifraControl !== cifre[12]) {
    out.erori.push('Cifră de control incorectă (poziția 13). Așteptat: ' + cifraControl + '.');
    return out;
  }

  out.isValid = true;
  out.meta = {
    sex: S % 2 === 1 ? 'masculin' : 'feminin',
    an_nastere: an,
    luna_nastere: luna,
    zi_nastere: zi,
    judet_nastere: judet
  };
  return out;
}

/* ── Cum se folosește în n8n ──────────────────────────────────
 * Nod "Code", Mode: "Run Once for All Items".
 * Lipește TOT acest fișier în editor, apoi adaugă la final:

 *   return items.map(item => {
 *     const date = item.json.date_corectate || item.json.date_ocr || {};
 *     const v1 = valideazaCNP(String((date.date_vanzator || {}).cnp || ''));
 *     const v2 = valideazaCNP(String((date.date_cumparator || {}).cnp || ''));
 *     return { json: {
 *       ...item.json,
 *       cnp_valid_tot: v1.isValid && v2.isValid,
 *       cnp_erori: v1.erori.concat(v2.erori)
 *     } };
 *   });
 * ──────────────────────────────────────────────────────────── */

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { valideazaCNP };
}
