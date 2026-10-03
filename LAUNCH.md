# AutoAct — Plan de lansare (LAUNCH.md)

> Documentul care spune **în ce ordine** se pornește AutoAct și **ce blochează** fiecare pas.
> Tot ce e în cod e testat automat (`bash ruleaza-teste.sh` — 15 pași, verde în CI).
> Ce **nu** poate fi testat de cod e listat aici ca blocaj: conturi, secrete, decizii legale.

**Promisiune de produs:** pachet acte transcriere auto în 60 s · 49 RON · cost operațional **0 RON**.
**Stivă:** n8n + PostgreSQL + Caddy pe Oracle Cloud Free Tier · site static în `site/`.

---

## 0. Situația la data documentului

| Componentă | Stare |
|---|---|
| 6 module + BLUEPRINT | ✅ livrate, testate |
| Workflow pipeline (14 noduri) + plăți (22 noduri) | ✅ generatoare cu auto-validări, JSON importabil |
| Șabloane Google Docs (3 documente, 37 placeholder-e) | ✅ conținut redactat pe disc |
| Site static + pagină de contact | ✅ generate din `site/*.sablon.html` |
| Idempotency + GDPR contra PostgreSQL real | ✅ 27/27 pe Docker |
| NAP (CIF, adresă, telefon) | ⚠️ **PLACEHOLDER** — blochează deploy-ul |
| Pagini `/termeni` și `/gdpr` | ❌ **nu există** — linkuri moarte în footer |
| Cont Stripe (sandbox) + produs 49 lei + „Managed Payments" | ✅ creat, plăți reale măsurate |
| Cont Stripe **live** (Go live) | ❌ cere date personale + act de identitate |
| Conturi externe (OpenAI, Gemini, Google) | ❌ de creat |
| Git remote + push | ✅ repo public `blogbrasov-debug/autoact`, suita de 15 pași verde în CI |
| Identitate vizuală Facebook (5 materiale la dimensiunile Meta) | ✅ generate în `brand/png/` |
| Configurarea paginii + grupului Facebook | ✅ texte gata de lipit în `brand/facebook/` |
| Gardul materialelor Facebook contra codului | ✅ 151 verificări + 7 mutații, pasul 14 |
| Pagină și grup pe Meta | ❌ **nu create** — NAP-ul placeholder blochează publicarea cu date de contact |
| Verificarea identității pe Meta (buletin) | ❌ **nefăcută** — checklist pregătit în `brand/facebook/verificare-meta.md` |

---

## 1. Ordine de go-live — cu **de ce** înainte de **ce**

Ordinea nu e arbitrară: fiecare pas produce ceva de care are nevoie următorul. Săritul unui pas
costă mai mult decât timpul pierdut.

```
   [1] NAP + decizii legale  ──┐ (fără asta nu poți emite facturi conforme)
                               ↓
   [2] Conturi + secrete      ──┐ (fără chei, pipeline-ul nu procesează nimic)
                               ↓
   [3] Infra: VM + Docker     ──┐ (fără DB nu e idempotency, fără n8n nu e flux)
                               ↓
   [4] DB: schema + workflow  ──┐ (ordine fixă, vezi §4)
                               ↓
   [5] Site + config.js       ──┐ (NAP-ul completat AJUNDE automat în .env)
                               ↓
   [6] Import workflow-uri n8n + credentials
                               ↓
   [7] Smoke test pe o tranzacție reală de probă
                               ↓
   [8] GO + prima comandă reală
```

### Pasul 1 — NAP + decizii legale (blochează tot restul)

**De ce primul:** CIF-ul intră în `.env` la deploy și în JSON-LD/footer/pagină de contact. Fără el,
serverul pornește cu CIF fictiv și **nu se mai repară automat**.

1. Completează blocul `NAP` din [`site/config.js`](site/config.js):
   `DENUMIRE`, `CIF`, `REG_COM`, `ADRESA`, `TELEFON`, `EMAIL`.
   - **Cifra de control e validată automat** (cheia canonică `753217532`) — un CIF greșit face
     `node config-autoact.js` să arunce, deci nu poate trece neobservat.
2. Decide și completează paginile `/termeni` și `/gdpr` (vezi §2 — conținut legal, nu generat de cod).
3. Decide regimul de TVA cu contabilul (serviciu către persoană fizică → scutire, art. 282 ind. 2
   C.fisc. — **verifică**, nu presupune).

```bash
node site/construieste-inline.js   # regenerează paginile cu NAP-ul nou
node site/test-banca-cifre.js     # trebuie să NU mai afișeze avertismentul de placeholder
```

### Pasul 2 — Conturi externe + secrete

### Pasul 2 — Conturi externe + secrete

| Serviciu | Ce obținem | Unde intră |
|---|---|---|
| Oracle Cloud | VM A1 Always Free (**2 OCPU / 12 GB** — limita redusă de Oracle pe 15 iunie 2026) | — |
| **Stripe** | cont + „Managed Payments" activ + produs 49 lei + Payment Link + endpoint de webhook | `.env` (`STRIPE_WEBHOOK_SECRET`) |
| OpenAI | cheie API (Vision OCR) | n8n Credentials |
| Google AI Studio | cheie Gemini | n8n Credentials |
| Google (Docs + Gmail) | cont, OAuth2, 3 șabloane create din `module-2/sabloane/` | n8n Credentials + `.env` |
| Cloudflare (DNS + hosting) | `autoact.eu` → Cloudflare Pages (site); `api.autoact.eu` → IP-ul VM-ului | DNS |

⚠️ **Contul Google** e singurul care cere **creare manuală a celor 3 șabloane** — instrucțiunile sunt
în `module-2/sabloane/README.md`. Fără ele, nodul „Placeholder-e Docs" nu are ce înlocui.

⚠️ **Stripe: Signing secret-ul e obligatoriu.** Se ia din Developers → Webhooks → endpoint
(Signing secret) și se pune în `.env` ca `STRIPE_WEBHOOK_SECRET`. Fără el, nodul „Verificare
Semnătură" respinge **corect** orice eveniment — adică niciun document nu se generează.
`deploy-autoact.sh` verifică explicit dacă e completat și spune care cheie lipsește.


```bash
cd module-3
./deploy-autoact.sh ubuntu@IP_PUBLIC_AUTOACT autoact.eu
```

Scriptul: copiază compose + Caddyfile + site-ul generat, generează `.env` cu secrete **aleatorii** pe server,
configurează firewall-ul (80/443), instalează Docker, pornește stack-ul.
**Blocaje:** regiunea OCI se alege o singură dată; A1 e frecvent „out of capacity" (reia, nu
înlocui cu `E2.1.Micro`). **Backup obligatoriu:** `.env` (fără `N8N_ENCRYPTION_KEY` pierzi
credential-urile).

### Pasul 3.bis — Hosting și domeniu (decizia, cu motivul)

**Hosting: 0 RON, cu uz comercial permis, în două bucăți — site-ul pe Cloudflare Pages,
stiva (n8n + Postgres + API) pe Caddy în VM-ul Oracle.**

| Piesa | Unde stă | Cost | Uz comercial | Conturi noi | Verdict |
|---|---|---|---|---|---|
| Site static (3 pagini) | **Cloudflare Pages** | **0 RON** | **permis** | cont Cloudflare | **ales** |
| n8n + Postgres + webhook | **Caddy pe același VM Oracle** | 0 RON | nelimitat | **niciunul** | **ales** |
| Netlify Free (în loc de Pages) | Netlify | 0 RON | permis | cont Netlify | alternativă validă |
| GitHub Pages | GitHub | 0 RON | **interzis** | cont GitHub | **exclus** |
| Vercel Hobby | Vercel | 0 RON | **interzis** | cont Vercel | **exclus** |

De ce Cloudflare Pages pentru site: planul Free permite explicit uz comercial, include TLS,
dă 500 builduri/lună și până la 100 de domenii per proiect, fără card de plată. Site-ul e
static, are 3 pagini — îl poți publica azi, în mod demo (`WEBHOOK_URL` gol), fără să
aștepți serverul.

De ce Caddy rămâne pentru stivă: n8n și Postgres nu încap pe o găzduire de pagini statice, iar
webhook-ul de plăți trebuie să aibă TLS real. Caddy e deja în `docker-compose.yml`.

⚠️ **GitHub Pages e exclus**, deși e gratis și pare ideal: condițiile sale spun explicit că
platforma nu e destinată și nu e permisă ca serviciu de găzduire pentru afaceri online
(docs.github.com/pages → *Limits*: „not intended for or allowed to be used as a free
web-hosting service to run your online business"). Un site care vinde la 49 RON intră
exact în acea excludere. Vercel Hobby are aceeași limitare, declarată mai direct.

**Două adrese, un singur domeniu:** `autoact.eu` → site (Cloudflare Pages),
`api.autoact.eu` → VM (Caddy → n8n). Clientul nu vede diferența; eu câștig că site-ul rămâne
disponibil chiar dacă Oracle îți recicla instanța (vezi §2.bis).

### Starea reală a numelui „AutoAct" — verificată

Interogat pe 3 octombrie 2026, nu din memorie:

| Nume | Sursă | Stare |
|---|---|---|
| **autoact.eu** | WHOIS EURid (`whois.eu:43`) | **AVAILABLE** |
| **autoact.ro** | DNS-over-HTTPS + RDAP | **LIBER** |
| autoact.org | DNS (141.8.195.125) | ocupat |
| autoact.com | RDAP | ocupat |
| autoact.app | RDAP/DNS | ocupat |

`org` nu e o opțiune: e ocupat, și nici nu e extensia potrivită pentru un serviciu
comercial adresat pieței din România.

### Decizie: acum `.eu`, cu `.ro` după CUI

Bugetul e de 2 EUR, iar `.eu` intră în el chiar la prima înregistrare:

| | `.eu` — alegem **acum** | `.ro` — după CUI |
|---|---|---|
| Preț anul 1 | **$1.79** (Spaceship, cod promo `DOM80`, limită 1/client) | 12 EUR + TVA/an (tarif oficial RoTLD) |
| În lei (curs ECB 2 oct 2026: 1 EUR = 1.1225 USD) | ≈ **1,59 €**; cu TVA 19% ≈ **1,90 €** | ~55 lei/an |
| Reînnoire | $5.68/an ≈ 5,06 € | 12 EUR + TVA |
| Eligibilitate | **cetățean UE indiferent de reședință**, rezident UE sau organizație stabilită în UE (EURid, din 2 aug 2021) | **CUI/PFA al registrantului** |
| Ce înseamnă pentru tine | **persoană fizică română e eligible, fără CUI și fără firmă** | nevoie de CUI → abia după NAP |

⚠️ **Prețul de $1.79 e promoțional și valabil un singur an** — reînnoirea e $5.68. Bugetă cei
2 EUR pentru **primul an**; de acolo încolo e o decizie de business, nu de lansare.

⚠️ **`autoact.eu` e liber *acum* și poate fi luat de oricine în orice moment.** Cumpără-l
înainte să te ocupi de orice altceva.

`.ro` rămâne obiectivul de mai târziu, imediat ce ai CUI-ul: e semnul maxim de încredere
pentru cine plătește 49 RON în RON. Până atunci, `.eu` nu blochează nimic — toate adresele
din cod sunt deja migrate pe `autoact.eu`.

### Pasul 4 — Baza de date + workflow-uri (ordine fixă)

```bash
# 1. schema de bază (crează tabela tranzactii) — neapărat ÎNTÂI
sudo docker compose exec -T postgres psql -U autoact -d autoact < module-4/gdpr-purge.sql
# 2. schema de plăți (ALTER-uri pe tranzactii)
sudo docker compose exec -T postgres psql -U autoact -d autoact < module-5/plati-schema.sql
```

⚠️ **Ordinea e obligatorie.** `plati-schema.sql` doar face `ALTER TABLE tranzactii` — pe o bază
goală, erorează cu `relation "tranzactii" does not exist`. Ambele sunt idempotente (se pot relua).

Apoi, în n8n: **⋯ → Import from File** → `module-2/autoact-workflow.json` și
`module-5/autoact-workflow-plati.json`, apoi atribuie credential-urile și activează.

### Pasul 5 — Site

1. `site/config.js` → `WEBHOOK_URL` = Production URL-ul nodului „Webhook UI" (pasul 6 îți dă URL-ul).
2. `node site/construieste-inline.js` → generează `index.html`, `contact.html`, `demo-standalone.html`.
3. Publică site-ul pe **Cloudflare Pages** (uz comercial permis, fără card): proiect nou →
   „Upload assets" → încarcă `site/dist/`. Alternativa gratuită e Netlify Drop; **nu**
   GitHub Pages (interzis comercial — vezi §3.bis).

### Pasul 7 — Smoke test (înainte de GO, obligatoriu)

- **Plată reală de 49 RON**, de la zero: introdu pozele, verifică datele, plătești, primești ZIP.
- Verifică manual: contractul are datele corecte, VIN-ul e valid, iar **factura vine de la Stripe**
  cu TVA 8,50 lei și total 49,00 lei (factura noastră NU trebuie să existe — ar fi a doua).
- Verifică idempotența: retrigger-ează **webhook-ul Stripe** (Stripe Dashboard → Logs → resend)
  și confirmă că **nu se livrează un al doilea ZIP**.
- Verifică semnătura: un POST cu `Stripe-Signature` fals trebuie respins cu **HTTP 400**.
- Verifică job-ul GDPR: după 48h de la livrare, datele sunt epurate.
- Verifică `curl -I https://autoact.eu` → TLS valid, redirect 80→443.
---

 — cum încasăm **fără CUI** + de ce 49 lei (3 oct. 2026)

Procesatorul ales este **Stripe**, în rol de **Merchant of Record** („Managed Payments"):
Stripe este vânzătorul de drept, emite factura și chitanța cu TVA către client și remite
TVA-ul. Deci **nu e nevoie de CUI ca să încasăm**.

| Ce am verificat | Rezultat |
|---|---|
| Stripe acceptă vânzători din România? | **Da** — cont creat și onboardat complet, fără CUI |
| „Managed Payments" e activ? | **Da** — Stripe preia rolul de vânzător și retine TVA |
| Produsul e „Eligible for Managed Payments"? | **Da** — prin alegerea codului fiscal `txcd_10000000` (General – Electronically Supplied Services) |
| Factura ajunge la client? | **Da** — factură + chitanță descărcabile imediat după plată |
| Cum se plătește vânzătorului? | transfer bancar, la cursul Stripe (nu ne interesează: vânzăm în lei) |
| Procesatori românești (Netopia, SmartBill, Salt)? | cer **CUI** pentru contract de merchant — de aceea nu sunt folosiți |

**Până la regularizare, banii sunt tot venit declarabil** — procesatorul raportează plățile.
„Facturăm retroactiv când ne fiscalizăm" este **regularizare**, nu o scurtăcută: dacă ANAF consideră
că ai desfășurat activitate economică neregistrată, urmează constatare și amendă.

Pragul de regularizare e o singură cifră, în `site/config.js`:

```
PLATARI: { PROCESATOR: 'stripe', PRAG_COMENZI_REGULARIZARE: 200 }
```

`site/test-banca-cifre.js` verifică la fiecare rulare că procesatorul și pragul din config.js
sunt aceleași cu cele exportate și descrise în acest document — decizia nu se învețeze în tăcure.

### Prețul: **49 lei, TVA inclus** — măsurat, nu estimat

Prețul a fost ales **pe baza a două plăți reale în Stripe sandbox** (card de test, facturare
România), nu pe baza unei cotă de pe site-ul Stripe:

| Varianta | Brut | Tax reținut | Procesare | Conversie valutară | **Net încasat** |
|---|---|---|---|---|---|
| 9,16 € (49 lei ÷ curs) | 48,90 lei | −8,49 | −0,98 | **−3,52** | **36,89 lei** |
| **49,00 lei (aleasă)** | 49,00 lei | −8,50 | −2,54 | **0** | **37,96 lei** |

Cele trei lucruri pe care le câștigăm plățind în lei:
1. **+1,07 lei/tranzacție** net (37,96 vs 36,89) — exact taxa de conversie care lipsea;
2. **cursul de schimb devine irelevant** pentru marjă — prețul încasat nu mai depinde de o
   cotă pe care nu o controlem și nu o putem promite clientului;
3. **prețul afișat = prețul contractat = prețul încasat**, în aceeași monedă: nu mai există
   o față a prețului în altă valută care trebuie ținută sincronizată cu prima.

Factura afișată la checkout: TVA 8,50 lei, total 49,00 lei — prețul e cu TVA inclus
(`tax_behavior` pe produs), deci clientul nu adaugă nimic la plată.

⚠️ **Limită explicită:** aceste cifre sunt din **SANDBOX**, unde taxele sunt simulate.
Comisionul „Managed Payments" (+3,5%/tranzacție) **nu apare** în niciun breakdown sandbox,
deci **netul real după Go live trebuie reconfirmat** printr-o plată reală. Estimarea
conservatoare cu comision inclus e ≈ 36,25 lei/tranzacție — marja rămâne confortabil pozitivă.

### Cum arată decizia în cod (verificat de teste, nu doar documentată)

| Fapt verificat | Consecință în cod |
|---|---|
| Webhook-ul vine cu antetul **`Stripe-Signature`** = HMAC-SHA256 peste **octeții exacti** ai body-ului | nodul Webhook are **RAW BODY** pornit; verificarea se face pe Buffer, nu pe obiectul parsat |
| Comparația de semnătură trebuie să fie constantă în timp | `crypto.timingSafeEqual`, niciodată `!==` pe șiruri |
| Un body capturat poate fi reluat oricând | antetele mai vechi de 300 s sunt respinse |
| Suma vine în **unități mici** (`amount_total: 4900`) și în notația minorității (`ron`) | normalizare într-un singur loc: `suma = centi / 100`, `moneda = 'RON'` |
| Legătura plată ↔ dosar | `client_reference_id` pus de Payment Link = `id_tranzactie` |
| Idempotența trebuie să fie pe eveniment repetat | `plati_procesate.order_id` unic; retransmisia e oprită înainte de generare |

⚠️ **Cifra 200 este o decizie de afacere, nu una de lege.** Pragul legal depinde de regimul
aplicabil și trebuie confirmat cu un contabil înainte de a te baza pe el; o oră de consultanță
costă 100–200 lei și elimină cea mai mare incertitudine din tot proiectul.

**Migrare încheiată:** `module-5/autoact-workflow-plati.json` conține 22 noduri
(18 pipeline + 4 sticky) pe fluxul Stripe. Criptografia Netopia (RSA + AES-CBC) și nodurile
SmartBill au fost eliminate; ~30 de auto-validări au fost rescrise, dintre care 9 prind
**sabotaje reale** ale semnăturii (secret greșit, corp modificat, antet vechi, antet absent,
secret neconfigurat, body parsat, sumă greșită, plată fără tranzacție).

---

 — **nu se poate genera din cod**

`/termeni` și `/gdpr` sunt linkate în footer dar **nu au pagină**. Textul lor e o decizie
juridică, nu una tehnică — și nu poate fi inventat de un agent.

**Blocaj de lansare real:** în SU, consu-matorul trebuie să vadă înainte de plată cine e
vânzătorul (CIF, adresă, contact) și cum sunt tratate datele. NAP-ul e deja pe site, dar
politica de rambursare și bazele legale ale prelucrării trebuie scrise de om.

Sunt necesare: identitatea operatorului, scopul prelucrării, baza legală, perioada de păstrare
(48h, deja implementată și verificată de test), drepturile persoanei vizate, contact pentru
exercitarea drepturilor.

---

## 2.bis Riscuri care taie „0 RON" — nu sunt costuri, dar te lasă fără produs

**a) Resurse inactive = reclaim.** Oracle tratează ca „idle" o instanță cu
sub ~20% CPU, ~20% RAM și rețea sub 20% **timp de 7 zile**, iar conturile inactive
30+ zile pot fi considerate abandonate. Translated: un cont nou, fără comenzi,
riscă să-și vadă VM-ul oprit fără un motiv vizibil. Nu e factură — e dispariția
serviciului și zile de refacere.

Cum te protejezi: după deploy, verifică weekly în Oracle Console starea
instantei și pe un job săptămânal care face un `curl` pe `api.autoact.eu` (deci
n8n execută ceva și contul nu e „idle"). Un ping real de săptămânal e suficient.

**b) Limita Always Free s-a înjumătățit.** Pe **15 iunie 2026**, Oracle a redus
contingentul Ampere A1 de la 4 OCPU / 24 GB la **2 OCPU / 12 GB**, fără anunț
public. Pe cont Free-only, o instanță 4/24 este **oprită automat**; pe cont PAYG,
depășirea generează **factură reală**. Documentația cerea încă 4/24 — deci nimic
nu s-ar fi plătit, dar serverul ar fi murit după prima întreținere.
`verifica-cost-0.js` (pasul 12 din runner) verifică limita la fiecare rulare.

**c) „Cost fix 0 RON" ≠ „cost total 0 RON".** Costurile care cresc cu volumul:
OpenAI Vision OCR ≈ 0,13 RON/comandă (5 imagini), comision Stripe
(„Managed Payments" ≈ 3,5% + procesare) per tranzacție. La 49 RON/comandă marja rămâne
confortabil pozitivă — dar onest e să știi că există. Cifrele se verifică
executând `node verifica-cost-0.js`.

### Cum e apărată promisiunea de la cod

Un document bun nu e suficient: cineva mărește un `mem_limit` și pierde
garantia. De aceea limita e un **test care pică**, nu o notă:

| Ce verifică `verifica-cost-0.js` | De ce contează |
|---|---|
| Nicio cerere peste 2 OCPU / 12 GB în documente | depășirea oprește serverul sau generează factură |
| Fiecare serviciu din compose **are** `mem_limit` și `cpus` | fără plafon, un vârf de consum oprește tot stack-ul |
| Suma limitelor încape în VM (7,25 GB din 12) | fiecare serviciu poate respecta individual și totuși suma nu încape |
| Imagini în **allowlist**, nu blacklist | orice serviciu cu plată nou intră pe furiș dacă lista e interziceri |
| Niciun secret cu valoare literală în deploy | o parolă lipită în shell ajunge în repo |
| Prețul acoperă costul variabil cu factor ≥ 3× | altă marjă nu mai e marjă |

Testul de mutație (`node module-5/test-mutatie-cost.js`) injectează **11
încălcări** una câte una (limită de compute mărită, memorie nelimitată,
imagine plătită, secret literal, preț sub cost, config invalid) și cere ca
gardul să CADĂ la fiecare, apoi verifică că arborele a rămas neatins.
Rulează în ~2 s, deci intră în CI fără cost.

**Concluzia onestă:** promisiunea „0 RON" e despre **cost fix** și se
verifică automat. Ea ține până la primii bani, cu o condiție: **să nu
atingi cotele**. Iar dacă vrei certitudine absolută, singura opțiune rămâne
un card de plată legat la cont — Oracle nu notifică înainte de a taxa.

## 2.ter Facebook — pagina, grupul și materialele care nu trebuie să mintă

Tot ce e în `brand/facebook/` e **text gata de lipit**, nu îndrumări de
scris: [`pagina.md`](brand/facebook/pagina.md), [`grup-clienti.md`](brand/facebook/grup-clienti.md),
[`copy-postari-lansare.md`](brand/facebook/copy-postari-lansare.md),
[`calendar-2-saptamani.md`](brand/facebook/calendar-2-saptamani.md) și
[`verificare-meta.md`](brand/facebook/verificare-meta.md) — ultimul e
checklist-ul pentru ziua în care vii cu actul de identitate și cardul.

**De ce există un gard automat, nu doar texte bune.** La ClarTransfer textele
de pe pagină promiseau un coridor de transfer care nu exista. S-au corectat
în 5 minute, în postări — dar au rămas trei materiale grafice și o linie de
calendar, pentru că **textul se rescrie deschizându-l, iar o imagine nu se
corectează decât dacă cineva o redeschide**. De aceea
`brand/test-copy-facebook.js` (pasul 14 al suitei) CADE pe fișier:

| Ce verifică | Sursa de adevăr |
|---|---|
| orice „NN lei" / „NN RON" din materiale | `PRET_RON` din `site/config.js` |
| orice „NN documente" | numărul real de șabloane din `module-2/sabloane/` |
| promisiuni nesemnate („toate orașele", „în Europa"…) | lista scrisă în cod, cu motivul fiecăreia |
| NAP-ul placeholder în textul de lipit | `NAP` din `site/config.js` |
| PNG mai vechi decât sursa HTML | `brand/png/` vs `brand/*.html` |

**Verificat prin 7 mutații reale** (`brand/test-mutatie-facebook.js`),
nu doar prin „merge". Două dintre ele au prins găuri ale primei versiuni a
gardului, nu doar erori în materiale: prețul greșit pus **în blocul de cod
de lipit** trecea (deci bio-ul paginii nu era verificat deloc), iar o
promisiune scrisă **fără diacritice** („orasele") trecea — deși textele de
pe Facebook se scriu adesea așa.

**De ce PNG-urile intră în verificare.** Materialul de pe pagină e PNG-ul,
nu HTML-ul. Dacă editezi textul și uiți randarea, textul nou e „corect" în
repo și nu-l vede nimeni nicăieri. Gardul cere `node brand/exporta-png.js`
și comitarea PNG-ului regenerat.

**Ce NU facem:** reclame, boost, Graph API. Postările sunt organice, prin
Meta Business Suite (gratuit, 20 min – 29 zile în avans). Programarea prin
API cere app review de 2–6 săptămâni și nu se justifică pentru un volum
atât de mic. Grupul nu se poate programa nativ — se postează manual.

## 3. Blocaje critice — rezumat

| # | Blocaj | Cine decide | Când blochează |
|---|---|---|---|
| 1 | NAP placeholder (`RO00000000`) | Fondator | **deploy-ul se oprește** |
| 2 | Pagini `/termeni` + `/gdpr` lipsă | Fondator + juridic | lansare publică |
| 3 | Conturi Google (Docs + Gmail) | Fondator | pașii 2, 6, 7 |
| 4 | 3 șabloane Google Docs create | Fondator | pasul 6 |
| 5 | Cont Stripe **live** (date personale + act de identitate) | Fondator | pasul 7 (doar sandbox merge acum) |
| 5.bis | `STRIPE_WEBHOOK_SECRET` în `.env` | Fondator | **nicio plată nu generează documente** |
| 5.ter | Regim TVA confirmat cu contabilul | Contabil | înainte de 200 de comenzi |
| 6 | `autoact.eu` înregistrat (≈1,59 €) | Fondator | pasul 3 (fără domeniu, Caddy nu poate emite TLS) |
| 7 | DNS `autoact.eu` → Pages, `api.autoact.eu` → VM | Fondator | pasul 3 (Caddy emite TLS doar cu DNS valid) |
| 8 | `.env` de pe server salvat local | Fondator | **pierderea credential-urilor n8n** |
| 9 | Cloudflare Pages: proiect creat, site publicat | Fondator | pasul 5 (site-ul rămâne local, nevizibil) |
| 10 | Reclaim pe cont inactiv | Fondator | continuitate (vezi §2.bis) |
| 11 | NAP placeholder — blochează și pagina Facebook | Fondator | publicarea pe Meta cu date de contact |

---

## 4. Rollback

| Situație | Ce faci |
|---|---|
| Workflow n8n stricat | Importă din nou fișierul `.json` din repo |
| Cod n8n stricat | `sudo docker compose exec n8n n8n import:workflow --separate --input=backup.json` |
| Secret pierdut | **irecuperabil** — creează alt cont n8n și reatribuie credential-urile |
| Pachet livrat de două ori | `plati_procesate` are `order_id` unic; interogă `SELECT * FROM plati_procesate ORDER BY procesat_la DESC` |
| Stack jos | `sudo docker compose ps` → `logs -f n8n` → `restart n8n` |

**Backup-uri obligatorii (totul gratuit):**
```bash
sudo docker compose exec n8n n8n export:workflow --all > backup-workflows.json
sudo docker compose exec -T postgres pg_dump -U autoact autoact > backup-db.sql
cp .env backup-env-local        # ⚠️ NU în git
```

---

## 5. Checklist înainte de GO

- [ ] NAP complet în `site/config.js`, fără avertisment de placeholder la test
- [ ] `bash ruleaza-teste.sh` verde (15/15 pași)
- [ ] `/termeni` și `/gdpr` publicate și linkate
- [ ] Conturi create, secrete introduse în n8n + `.env`
- [ ] 3 șabloane Google Docs create, ID-urile în `.env`
- [ ] Schema aplicată în ordine (4.1 → 4.2), fără erori
- [ ] Workflow-uri importate și **activate**
- [ ] `WEBHOOK_URL` real în `config.js`, pagini regenerate
- [ ] Smoke test complet cu plată reală de 49 RON ✅
- [ ] Job GDPR verificat (epurare după 48h)
- [ ] TLS valid, redirect 80→443
- [ ] `.env` salvat local, în afara git
- [ ] Git: totul comis și pushat

---

**Decizia finală (preț, domeniu, regim fiscal, momentul lansării) aparține Fondatorului.**
Tot ce poate fi automatizat și verificat prin cod este deja automatizat și verificat.