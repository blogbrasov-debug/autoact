/* AutoAct | site | config.js
 * Unicul fișier de editat la deploy.
 * WEBHOOK_URL = Production URL-ul nodului „Webhook UI" din workflow-ul n8n
 * (module-2/autoact-workflow.json): https://autoact.eu/webhook/test-ui
 * ⚠ Un singur domeniu: Caddy servește site-ul ȘI webhook-urile pe domeniul
 * de la deploy (deploy-autoact.sh … autoact.eu). De aceea și webhook-ul
 * Stripe de mai jos e pe același domeniu, nu pe un subdomeniu.
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
 * lansare. Aceleași valori trebuie puse și în contul Stripe (Settings →
 * Business → Tax code) și în .env pe server:
 * STRIPE_WEBHOOK_SECRET=<whsec_…>, altfel webhook-ul nu poate fi
 * verificat și niciun document nu se generează.
 */
window.AUTOACT_CONFIG = {
  WEBHOOK_URL: '',

  /* Prețul are O SINGURĂ față: 49 lei, TVA inclus.
 * Clientul plătește și contractul consemnează aceeași sumă, în aceeași
 * monedă — deci nu există curs de conversie, risc de variație și nici
 * nevoie ca suma încasată să fie verificată în două locuri.
 * Măsurătorile reale (Stripe sandbox, card de test, facturare România):
 *   49,00 lei brut → tax reținut −8,50 · procesare −2,54 → net 37,96 lei
 *   (varianta 9,16 € costa 36,89 lei: taxa de conversie de 3,52 lei nu
 *    exista în niciodată una dintre cele două cifre din sandbox)
 * ⚠ Netul de mai sus e din SANDBOX: comisionul „Managed Payments"
 * (+3,5%/tranzacție) nu apare în simulare. De reconfirmat după Go live. */
  PRET_RON: 49,

  /* Decizie fiscală (3 oct. 2026): procesatorul este **Stripe**, cu
   * „Managed Payments" — Stripe este vânzătorul de drept (Merchant of
   * Record), emite factura și chitanța către client și reține TVA, deci
   * NU e nevoie de CUI ca să încasăm. Produsul are tax_behavior inclus
   * (preț cu TVA), iar codul fiscal de mai jos îl face „Eligible".
   *
   * Până la regularizare, banii sunt tot venit declarabil — procesatorul îi
   * raportează. PRAG_COMENZI_REGULARIZARE e comanda la care te oprești și
   * te înregistrezi (CUI/PFA). Singurul loc unde se schimbă cifra asta.
   */
  PLATARI: {
    PROCESATOR: 'stripe',
    PRAG_COMENZI_REGULARIZARE: 200,
    /* Un singur comutator: suntem pe bani reali sau încă în test mode?
     * false → Payment Link-ul trebuie să fie de test și nicio pagină
     * livrată nu poate conține un link de plată (altfel un client ajunge
     * într-un flux de plată fals și nu mai știi dacă a plătit).
     * true  → linkul trebuie să fie live (…/live_…).
     * Verificarea stă în config-autoact.js (verificaLegaturaStripe) și
     * e testată cu mutații în module-5/test-stripe-live.js.
     * Pașii de activare, cu IBAN cu tot: module-5/configurare-stripe-live.md */
    LIVE: false
  },

  /* Identificatorii din contul Stripe. ID-urile nu sunt secrete (Payment
   * Link-ul ajunge oricum în payload-ul trimis clientului), dar nici ele
   * nu se scriu cu gura în workflow-uri sau șabloane: config-autoact.js
   * le citește aici și le generează acolo unde trebuie.
   * La migrarea pe cont live se schimbă DOAR acest bloc. */
  STRIPE: {
    PRODUS_ID: 'prod_VNHNWQzMXG49vc',   // „Pachet acte auto — vânzare auto (contract + cerere DRPCIV)"
    PRET_ID: 'price_1UMWpDPhXnPwCaLh5VcKOavY',   // 49.00 RON, one-off, TVA inclus
    PAYMENT_LINK: 'https://buy.stripe.com/test_6oU8wR7L91QodQ97ap4ZG01',
    COD_FISCAL: 'txcd_10000000',       // General — Electronically Supplied Services
    WEBHOOK_URL_STRIPE: 'https://autoact.eu/webhook/stripe'
  },

  /* Cele două lucruri pe care legea nu le poate deduce din cod și pe care
 * numai fondatorul le poate decide: data de la care intră în vigoare
 * termenii, și instanțele în care se rezolvă disputele. Sunt marcate ca
 * PLACEHOLDER de aceeași manieră ca NAP-ul, pentru că o pagină de termeni
 * fără dată și fără instanțe nu e o pagină de termeni — și nu trebuie
 * publicată ca atare. Verificarea: site/test-banca-cifre.js CADE cât timp
 * e vreo valoare de umplut aici. */
  LEGAL: {
    DATA_ACCEPTARE: '2026-10-03',  // ← înlocuiește cu data la care semnezi varianta finală
    INSTANTE: 'înlocuiește: instanțele competente de la sediul firmei'
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