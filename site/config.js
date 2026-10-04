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
   * NU trebuie să emiți factură tu ca să încasezi. Produsul are
   * tax_behavior inclus (preț cu TVA), iar codul fiscal de mai jos îl
   * face „Eligible".
   *
   * ⚠ Corectat la 4 oct. 2026, după ce am citit formularele reale:
   * versiunea anterioară a acestui comentariu spunea că „CUI-ul se ia
   * înaintea primei plăți”. Era FALS. Stripe scrie: „You must have a TIN
   * (or government-issued ID number, if you are an individual or sole
   * proprietor)…”, iar pentru România documentația lor listează CNP ca
   * identificator național. Formularul „Tax information” cere explicit
   * „CIF/CUI **or** Personal Numeric Code (CNP)”. Deci pentru un individ
   * CNP-ul e suficient, iar PFA-ul nu e blocaj încasării. Ce aduce MoR
   * rămâne valabil: factura către client o emite Stripe, nu tu.
   */
  PLATARI: {
    PROCESATOR: 'stripe',
    /* Pragul de DISCUȚIE cu contabilul (regim de TVA), nu data de la care
     * devii legal și nici un blocaj tehnic. La business type în România
     * există doar `individual` (PFA / întreprinderea individuală),
     * `company` (SRL) și `non_profit` — dar alegerea business type-ului
     * NU impune obținerea unui CUI înainte de încasare: pentru un
     * individ, Stripe acceptă numărul de act de identitate (CNP) în
     * loc de TIN. Pragul de mai jos rămâne întrebarea „trecem la
     * sistem real sau nu?”, de discutat cu contabilul. */
    PRAG_COMENZI_REGULARIZARE: 200,
    /* Un singur comutator: suntem pe bani reali sau încă în test mode?
     * false → Payment Link-ul trebuie să fie de test și nicio pagină
     * livrată nu poate conține un link de plată (altfel un client ajunge
     * într-un flux de plată fals și nu mai știi dacă a plătit).
     * true  → linkul trebuie să fie live (fără prefixul `test_`).
     * Verificarea stă în config-autoact.js (verificaLegaturaStripe) și
     * e testată cu mutații în module-5/test-stripe-live.js.
     * Pașii de activare, cu IBAN cu tot: module-5/configurare-stripe-live.md */
    LIVE: true
  },

  /* Identificatorii din contul Stripe. ID-urile nu sunt secrete (Payment
   * Link-ul ajunge oricum în payload-ul trimis clientului), dar nici ele
   * nu se scriu cu gura în workflow-uri sau șabloane: config-autoact.js
   * le citește aici și le generează acolo unde trebuie.
   * La migrarea pe cont live se schimbă DOAR acest bloc. */
  STRIPE: {
    /* Cont LIVE (4 oct. 2026). Produsul a fost creat de la zero în contul
     * real, nu copiat din sandbox: copierea ar fi adus un link de test în
     * contul de plată reală. Verificat pe paginile produsului/prețului:
     * tax_behavior inclusive („Tax included in price: Yes”), tax code
     * txcd_10000000, interval „One-time”, RON 49.00, iar produsul e
     * marcat „Eligible” pentru Managed Payments. */
    PRODUS_ID: 'prod_VNVcTLZo8nibZy',   // „Pachet acte auto — vânzare auto (contract + cerere DRPCIV)"
    PRET_ID: 'price_1UMkbUBRTh54P0hRemTtrIJS',   // 49.00 RON, one-off, TVA inclus
    PAYMENT_LINK: 'https://buy.stripe.com/4gMaEWbsY9mR3NufPx1Nu00',
    COD_FISCAL: 'txcd_10000000',       // General — Electronically Supplied Services
    WEBHOOK_URL_STRIPE: 'https://autoact.eu/webhook/stripe'
  },

  /* Cele două lucruri pe care legea nu le poate deduce din cod: data de la
 * care intră în vigoare termenii, și instanțele în care se rezolvă
 * disputele. Data e cea de azi; instanțele sunt formula standard pentru un
 * contract cu consumator — întâi judecătoria de la domiciliul părților, apoi
 * tribunalul din circumscripție (NCPC, materie personală). Au fost
 * completate la 4 oct. 2026, deci nu mai blochează deploy-ul.
 * ⚠ DATA_ACCEPTARE: schimb-o dacă termenii se modifică ulterior — data e cea
 * de la care versiunea curentă intră în vigoare. */
  LEGAL: {
    DATA_ACCEPTARE: '2026-10-04',
    INSTANTE: 'disputele se rezolvă la judecătoria de la domiciliul părților sau, după caz, de la locul de încheiere a contractului; pentru gradul de apel, la tribunalul din circumscripția teritorială a acelei judecătorii'
  },

  /* NAP = Nume, Adresă, Punct de contact. Apare în footer, pe pagina de
   * contact și în JSON-LD (Organization) — totul se generează din aici.
   *
   * ⚠ CIF și REG_COM sunt OPȚIONALE de la 4 oct. 2026. Lăsate goale, sunt
   * pur și simplu nepublicate (config-autoact.js → NAP_PUBLICA scoate
   * câmpul din payload), iar blocul din footer dispare curat.
   * Umple-le când ai CUI de la ANAF, iar ele apar imediat, fără altă
   * modificare. Cât timp sunt goale, documentele care le cer (contract,
   * cerere DRPCIV) NU pot fi emise — de aceea generatorul rămâne oprit.
   * Motivul pentru care sunt opționale: cine ia banul de la client e
   * Stripe (Managed Payments = Merchant of Record), nu noi.
   *
   * ADRESA și TELEFON rămân OBLIGATORII: GDPR art. 154 și OUG 34/2014
   * cer ca un site de vânzări să spună cine e vânzătorul și cum e de
   * contactat. Placeholder-uri aici înseamnă o firmă fictivă pe un
   * domeniu public. */
  NAP: {
    DENUMIRE: 'AutoAct',
    CIF: '',                    // ← opțional: CUI de la ANAF (PFA)
    REG_COM: '',                // ← opțional: Registrul Comerțului
    ADRESA: 'Str. MICA 25, bl. 25, sc. C, ap. 13, Brașov',
    TELEFON: '+40 720 308 702',
    EMAIL: 'contact@autoact.eu',
    SITE: 'https://autoact.eu'
  }
};