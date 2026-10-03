/* AutoAct | site | config.js
 * Unicul fișier de editat la deploy.
 * WEBHOOK_URL = Production URL-ul nodului „Webhook UI" din workflow-ul n8n
 * (module-2/autoact-workflow.json): https://api.autoact.eu/webhook/test-ui
 * GOAL = mod demo: pagina rulează fără server (previzualizare din
 * demo-data.js). Abia după ce pui URL-ul real, fluxul real se activează.
 *
 * NAP = Nume, Adresă, Punct de contact. Apare în footer, pe pagina de
 * contact și în JSON-LD (Organization) — totul se generează din aici,
 * deci nu se repetă nicăieri.
 *
 * ⚠ ATENȚIE LA DEPLOY: valorile NAP de mai jos sunt PLACEHOLDER.
 * CIF-ul e validat structural de config-autoact.js (cifra de control),
 * dar placeholder-ul NU e o firmă reală — înlocuiește-le înainte de
 * lansare. Aceleași valori trebuie puse și în .env pe server:
 * SMARTBILL_VAT_CODE=<NAP.CIF>, altfel factura iese cu alt CIF.
 */
window.AUTOACT_CONFIG = {
  WEBHOOK_URL: '',
  /* Prețul are două fețe, dintr-o singură decizie:
 *   PRET_RON — valoarea contractuală, în lei, cea care se scrie în
 *              documentele românești (nu se schimbă: e prețul promises).
 *   PRET_EUR — suma efectiv încasată, în euro, prin Paddle.
 * Calculul este INVERS: 49 RON ÷ 5,3488 RON/EUR (curs ECB, 2 oct. 2026)
 * = 9,1609 EUR. Clientul plătește 9,16 € la cursul Paddle; contractul
 * consemnează 49 lei. config-autoact.js verifică la fiecare rulare că
 * cele două fețe sunt compatibile — altfel prețul ar plăti dublu. */
PRET_RON: 49,
PRET_EUR: 9.16,

  /* Decizie fiscală (3 oct. 2026): procesatorul este **Paddle**, în rol de
   * „Merchant of Record" — Paddle este vânzătorul de drept, emite documentul
   * către client și remite TVA-ul, deci NU e nevoie de CUI ca să încasăm.
   * Verificat: Paddle acceptă vânzători din România; plătește prin IBAN/BIC.
   *
   * Până la regularizare, banii sunt tot venit declarabil — procesatorul îi
   * raportează. PRAG_COMENZI_REGULARIZARE e comanda la care te oprești și
   * te înregistrezi (CUI/PFA). Singurul loc unde se schimbă cifra asta.
   */
  PLATARI: {
    PROCESATOR: 'paddle',
    PRAG_COMENZI_REGULARIZARE: 200
  },
  NAP: {
    DENUMIRE: 'AutoAct',
    CIF: 'RO00000000',          // ← înlocuiește (placeholder)
    REG_COM: 'J00/000/0000',    // ← înlocuiește (placeholder)
    ADRESA: 'Str. Exemplu 1, Sector 1, București', // ← înlocuiește
    TELEFON: '+40 700 000 000',  // ← înlocuiește
    EMAIL: 'contact@autoact.eu',
    SITE: 'https://autoact.eu'
  }
};