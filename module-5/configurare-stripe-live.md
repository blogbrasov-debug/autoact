# Configurarea Stripe-ului: din sandbox în LIVE

Documentul e executat de om, în contul Stripe al fondatorului. **Nu conține
secrete și nu trebuie să conțină vreunul**: IBAN-ul, cheia API și semnătura
webhook-ului se introduc direct în interfața Stripe sau în `.env` pe server.
Tot ce se copiază aici în repo e public prin natura lui (ID-uri de produs și
Payment Link-ul ajung oricum în payload-ul trimis clientului).

Cifrele de mai jos sunt verificate automat de `module-5/test-stripe-live.js`
împotriva lui `site/config.js` și a workflow-urilor generate — dacă schimbi
prețul sau linkul în config, testul CADE până nu schimbi și documentul.

---

## 0. Starea de azi

Contul Stripe există cu **test mode** pornit: produsul de 49 lei și
Payment Link-ul de test sunt create, iar plățile au fost măsurate pe sandbox
(cifrele din `LAUNCH.md` §1.bis). De azi începe partea de **live**.

Regulă de aur: **test mode și live mode sunt același cont, două regimuri.**
Nu ștergi nimic din test mode. Clonezi produsul în live, ca să poți măsura
în continuare fără să tai în carne vie produsul testat.

## 1. Activate live — formularul din cont

Contul live există deja, ca al doilea cont în același login (lângă sandbox, în
colțul din dreapta-sus apare „Switch to live account”). Deci nu creezi nimic:
intri în contul live și apeși **Activate Payments**.

⚠️ **Țara de origine a contului devine ireversibilă** după activare (scris
explicit în documentația Stripe: „you can't change the business origin
country” după ce activezi un serviciu pe cont live). La 4 oct. 2026, în contul
live, câmpul era deja completat **Romania** — corect, și nu se mai schimbă.

Ce îți cere formularul, în ordine (citit direct din contul live):

| Câmp | Ce pui | De ce contează |
|---|---|---|
| Business location | **Romania** | deja completat; ireversibil |
| Business type | **Persoană Fizică Autorizată / Întreprinderea individuală** | Stripe România oferă doar trei variante: `individual` (PFA), `company` (SRL), `non_profit`. **Nu există „persoană fizică neînregistrată”** — vezi §1.bis |
| Nume legal | exact cum e în actul de identitate | trebuie să coincidă cu numele de pe IBAN, altfel contul trece în „restricted” |
| Adresă | adresa de **domiciliu** din act | e adresa pe care o verifică Stripe |
| Telefon | telefonul tău real | Stripe sună dacă ceva nu se potrivește |
| Email de suport | cel care primește întrebări de la clienți | apare pe pagina de plată și pe facturi |
| **IBAN** (pasul 2 „Add your bank”) | **RO**, cont în **lei**, pe numele titularului | Stripe face două micro-încărcări (câteva bani, apoi anulate) ca să-l verifice |

**IBAN-ul se introduce în Stripe, nu aici.** Nu în `config.js`, nu în `.env`,
nu într-un workflow, nu într-un mesaj. Un cont curent scris într-un fișier
versionat ajunge public la primul push.

### 1.bis. Nu trebuie PFA ca să încasezi: pentru un individ e suficient CNP-ul

Varianta `individual` din formular e contul unei **persoane fizice**. Iar
Stripe, în articolul despre TIN, scrie explicit:

> „You must have a TIN (or government-issued ID number, if you are an
> individual or sole proprietor) registered in your country of business in
> order to use Stripe.”

Adică: **pentru un individ, numărul de act de identitate e acceptat în loc de
CUI.** În România, documentația Stripe listează pentru verificare națională
exact `Cod Numeric Personal (CNP)` (vezi §1.ter.bis.bis). Consecința pentru
planificare: blocajul de la §1.ter **se rezolvă în 5 minute, cu date pe care
le ai deja în buzunar**, fără drum la ANAF, fără bani, fără săptămână de
așteptare.

`PLATARI.PRAG_COMENZI_REGULARIZARE = 200` rămâne pragul de discuție cu
contabilul (regim de TVA, dacă se trece la sistem real), nu o poartă pe care
Stripe nu te lasă să treci.

Ce rămâne de făcut, în ordine, și unde se oprește fiecare:

| Pas | Ce faci | Cost | Cât durează |
|---|---|---|---|
| 1 | Completezi `Tax information` cu numele de pe act + **CNP-ul** | 0 lei | 5 min |
| 2 | Stripe acceptă sau nu CNP-ul în acel câmp | 0 lei | imediat |
| 3 | *doar dacă pasul 2 e respins* — înregistrezi PFA la ANAF și revii cu CUI | 0 lei (înregistrarea e gratuită) | câteva zile |

**CNP-ul se introduce în Stripe, nu aici.** Nu în `config.js`, nu în
`.env`, nu într-un workflow, nu într-un mesaj către mine. E un identificator
personal, la fel de sensibil ca actul de identitate.

Nu completa cu un CUI inventat sau cu numărul unui prieten: numărul se
verifică, iar o valoare greșită blochează contul mai tare decât un câmp gol.

Cei 5 pași ai onboarding-ului, așa cum apar în cont:

1. **Verify your business** — Business type, Business details, Account
   representative, Products or services, Public details, Statement descriptor
2. **Add your bank** — aici se introduce IBAN-ul
3. **Secure your account** — 2FA (SMS e ultima variantă, nu prima)
4. **Add extras**
5. **Review and submit**

La pasul 1, la „Products or services", răspunsul corect pentru AutoAct e
serviciu digital generat automat (OCR + șabloane) — același lucru pe care îl
spui la review-ul de eligibilitate pentru Managed Payments.

### 1.ter. După Go live: `Tax information` e blocajul care rămâne

Formularul Settings → **Tax information** cere trei lucruri, toate goale:

| Câmp | Ce pune | De ce nu se poate completa acum |
|---|---|---|
| Type of business | Persoană Fizică Autorizată / Întreprinderea individuală | deja completat |
| **Numele exact de pe actul fiscal** | trebuie să coincidă **caracter cu caracter** cu numele de pe actul de identitate | îl ai acum |
| **Tax Identification Number** | **CNP-ul de pe actul de identitate** pentru un individ; CUI dacă ai PFA | îl ai acum — vezi §1.ter.bis.bis |
| **VAT number (CIF)** | doar dacă ești plățitor de TVA | nu se aplică la 49 lei vândute sporadic |

Stripe avertizează explicit: „Updating this information may introduce new account
requirements… You will have a **7-day grace period** during which account
functionality remains the same. To prevent your features from being blocked,
you must resolve all requirements by the end of the grace period.”

Așadar: contul funcționează acum, dar **nu se completează nicio plată de sus în jos**
cât timp formularul e gol și Stripe a început perioada de grație. Prioritatea după
PFA e să se completeze imediat cu datele de pe certificatul fiscal — un nume
greșit acolo înseamnă raportare fiscală greșită și cont restricționat.

### 1.ter.bis.bis. Calea rapidă, gratuită: CNP-ul de pe actul de identitate

⚠️ **Secțiunea care anulează „stai până obții PFA-ul”.** Dacă ai citit doar până
la §1.ter și ai crezut că blocajul cere un drum la ANAF și o săptămână, te-ai
oprit inutil. Nu cere.

**Dovada 1 — regula Stripe pentru indivizi.** Articolul oficial „Tax ID Number
(TIN) format is different than Stripe's suggested TIN format in the
dashboard" spune, cuvânt cu cuvânt:

> „You must have a TIN (**or government-issued ID number, if you are an
> individual or sole proprietor**) registered in your country of business in
> order to use Stripe.”

Deci pentru un **individual** numărul de act de identitate e acceptat în loc
de TIN. Contul tău e `individual` (Business type: Persoană Fizică Autorizată
/ Întreprinderea individuală).

**Dovada 2 — CNP e identificatorul național recunoscut de Stripe în
România.** Documentația „Upcoming requirements updates" are o tabelă
„National ID type" cu rândul:

> Romania — **Cod Numeric Personal (CNP)**

Asta e exact numărul de pe actul tău de identitate.

**Ce scrii, concret** (Settings → Business → Tax information):

| Câmp | Ce scrii | De unde |
|---|---|---|
| Numele legal | exact cum e scris în act, **caracter cu caracter** | actul de identitate |
| Tax Identification Number | **CNP-ul** | tot din act |
| CIF / VAT | **lăsa gol** — nu ești plățitor de TVA | — |

**Dacă Stripe totuși respinge CNP-ul** (nu s-a întâmplat, dar e posibil ca
formularul să ceară CUI pentru `individual`): atunci mergi la varianta PFA,
gratuită la ANAF. Nu e o catastrofă, dar e pasul 3, nu pasul 1.

⚠️ **CNP-ul nu se scrie nicăieri în acest repo** și nici nu mi-l trimiți. Se
introduce direct în interfața Stripe. E un identificator personal, la fel de
sensibil ca actul de identitate.

**Sursele** (verificate la 4 oct. 2026):
- <https://support.stripe.com/questions/tax-id-number-(tin)-format-is-different-than-stripe-s-suggested-tin-format-in-the-dashboard>
- <https://docs.stripe.com/connect/upcoming-requirements-updates>

### 1.ter.bis. Emailurile clienților nu pot fi în română

Settings → Customer emails → Default language oferă 16 limbi: Deutsch, English,
Español (ES), Français, Italiano, 日本語, Nederlands, Dansk, Norsk, Svenska, Suomi,
Português (BR), Español (LA), Ελληνικά, polski, Português (PT). **Româna nu este
disponibilă**, așa că bonurile și facturile emise de Stripe vin în engleză.

Nu e contradictoriu cu pagina de plată în română: aceea e interfața Link, care își
alege limba din browserul clientului. Textul fix trimis de noi (e-mailul cu ZIP-ul)
rămâne în română, fiind scris de noi, nu de Stripe.

### 1.ter.ter. Branding: culorile, iconul și logo-ul

Am setat deja culorile din contul live, **luate din paleta site-ului**
(`site/styles.css`, singura sursă): Brand color `#1558b0` (= `--albastru-închis`),
Accent color `#1a73e8` (= `--albastru`, culoarea butoanelor de pe site). Astfel
butonul „Plătește" din checkout are exact culoarea butonului „PLĂTEȘTE 49 lei" de pe
pagina noastră.

**Iconul și logo-ul rămân de încărcat manual**, pentru că Stripe cere fișiere, nu
SVG, iar `brand/` are logo doar în SVG (`brand/logo.svg`, `brand/logo-placuta.svg`).
Materialele PNG se generează cu `node brand/exporta-png.js`; pentru Stripe trebuie
un icon pătrat și un logo dreptunghiular, ambele cu fundal transparent.

## 2. După activare: `Managed Payments` (Merchant of Record)

Căută în cont după „Managed Payments”. **Nu e un buton, e un review de
eligibilitate.** Conform documentației Stripe, sunt trei condiții:

1. **Business location** — una din zonele suportate. România intră în
   categoria „Europe”, deci condiția e îndeplinită.
2. **Business eligibility** — „Stripe determines access based on an
   eligibility review that considers factors such as business type and
   geography”. Deci răspunsul final îl dă Stripe, nu noi.
3. **Produs digital, complet automatizat** — sunt excluse explicit serviciile
   profesionale și orice produs cu intervenție umană.

Dacă ne întreabă, răspunsul onest: pachetul e generat automat din poze
(OCR + șabloane), clientul își verifică propriile date înainte să plătească,
nu există consultanță umană. Codul fiscal folosit e `txcd_10000000`
„General — Electronically Supplied Services”, care **este** pe lista oficială
de coduri eligibile pentru Managed Payments.

**Dacă Stripe refuză** — și asta e o variantă reală, pentru că pachetul e
„documente pentru o tranzacție auto reală” și poate fi catalogat ca serviciu
profesional — atunci nu se schimbă codul, se schimbă modelul: procesator
simplu, **noi** suntem vânzătorul de drept, deci trebuie CUI/PFA înainte de
prima vânzare și emitem noi factura. Ziua nu e negociabilă cu legea.

## 3. Produsul live

Nu modifica produsul de test. **Clonează-l** în live mode și verifică:

- preț **49 RON**, **one-off** (o plată, nu abonament)
- **tax inclusive** — prețul afișat e cu TVA inclus, nu se adaugă TVA la
  final; altfel clientul vede 62,30 lei și proiectul minte în fața lui
- tax code **txcd_10000000**

## 4. Payment Link live

Payment Links → produsul nou → creează linkul → copiază URL-ul. **Forma
verificată pe contul real (4 oct. 2026):** linkul de test începe cu `test_`,
iar linkul live **nu are niciun prefix**:

```
test:  https://buy.stripe.com/test_6oU8wR7L91QodQ97ap4ZG01
live:  https://buy.stripe.com/4gMaEWbsY9mR3NufPx1Nu00
```

Deci „e live sau e test” se vede după prefixul `test_`, nu după `live_` —
regula greșită a fost scrisă aici la început și a oprit build-ul când
configul a primit linkul live autentic.

Asta e singurul lucru de pe întreaga listă pe care mi-l trimiți. Îl pun în
`site/config.js` (`STRIPE.PAYMENT_LINK`), rulez `bash ruleaza-teste.sh` și
reconstruiesc workflow-urile și pagina.

Cât timp `PLATARI.LIVE` e `false`, testul verifică că linkul e de test **și**
că nicio pagină livrată nu conține un link de plată — butonul „Cumpără acum”
nu apare pe site. Deci nu există cum să ajungă un client într-un flux de
plată fals.

## 5. Webhook-ul (obligatoriu înainte de prima plată reală)

Developers → Webhooks → Add endpoint:

| Câmp | Valoare |
|---|---|
| URL | `https://autoact.eu/webhook/stripe` |
| Eveniment | `checkout.session.completed` |
| Signing secret | `whsec_…` → `.env` pe server, ca `STRIPE_WEBHOOK_SECRET` |

**Endpoint-ul trebuie să existe și să răspundă înainte să-l adaugi în Stripe.**
Altfel Stripe refuză evenimentele și nu vei vedea niciodată notificarea: n8n
crede că nu s-a plătit și nu generează documentele, iar clientul a plătit.

Signing secret-ul **nu** mi-l trimiți. Deploy-ul creează `.env` cu cheile
goale și îți spune care lipsește; îl completezi tu prin SSH:

```
ssh <server> 'cd ~/autoact && nano .env'   # STRIPE_WEBHOOK_SECRET=whsec_…
```

`deploy-autoact.sh` verifică toate patru cheile și avertizează explicit pe
carea goală — pentru că un secret lipsă ar arăta ca un stack pornit cu
succes, iar prima plată reală s-ar pierde tăcut.

## 6. Datele publice din cont (apar pe extrase și facturi)

Settings → Business → public details. Clienții văd numele afișat pe
extrasul de cont și pe factura Stripe: **nume, adresă, email și telefon de
suport**. Trebuie să coincidă cu blocul NAP din `site/config.js` — aceleași
date apar și pe pagina de contact și în JSON-LD.

## 7. Verificare după ce e live

1. Fă o plată reală de **49 lei** cu cardul tău, de pe telefon, ca client.
2. Stripe → Logs → webhook-ul endpoint-ului: trebuie să apară
   `checkout.session.completed` cu `200 OK`. Dacă nu apare, problema e la
   URL-ul endpoint-ului, nu la n8n.
3. Verifică manual: ZIP-ul vine pe e-mail, iar **factura vine de la Stripe**,
   nu de la noi. Dacă factura apare și din partea noastră, ceva e dublu
   facturat și se oprește tot.
4. Retrigger-ează webhook-ul din Logs → **resend**: pachetul nu trebuie
   să se genereze a doua oară (idempotență).
5. Un POST cu antet `Stripe-Signature` fals trebuie respins cu **HTTP 400**.

## 8. Ce se întâmplă în cod, în ordine

| Fișier | Ce se schimbă |
|---|---|
| `site/config.js` | `PLATARI.LIVE: true` + cele trei ID-uri live |
| `module-2/autoact-workflow.json` | generat — Payment Link-ul intră în `url_plata` |
| `module-5/autoact-workflow-plati.json` | generat — webhook-ul primește evenimentul live |
| `site/index.html` | butonul „Cumpără acum”, abia acum |

### 7.bis. Ce înseamnă „Managed Payments” pentru client și pentru noi

La crearea linkului, Stripe scrie cifra costului în chiar formularul:
„This adds a **3.5% fee per transaction**”. Deci procentul necunoscut din
`LAUNCH.md` §1.bis e acum măsurat: **3,5% din fiecare tranzacție**, în plus
față de comisionul de procesare al cardului. La 49 lei înseamnă 1,72 lei
pe comandă.

Două consecințe care se văd la client:

1. **Checkout-ul este al Link-ului, nu al Stripe clasic.** Stripe scrie
   explicit: „When Managed Payments is enabled, Link powers the customer
   experience. The checkout page and receipts show the order is **Sold
   through Link**.” Clientul plătește pe pagină Link, în română, cu
   card, Apple Pay, Google Pay sau Link. Factura și bonul vin de la Stripe,
   ca înainte — partea noastră rămâne corectă.
2. **Nu se culeg nume și adrese** la checkout (casetele sunt blocate și
   ne-bifate). E-mail se cere. Workflow-ul trimite ZIP-ul pe e-mail, deci
   ne trebuie doar e-mailul — dar la prima plată reală trebuie verificat
   că `checkout.session.completed` îl conține într-adevăr, pentru că
   payload-ul Link poate fi diferit de cel al Checkout-ului clasic.
| `module-5/test-stripe-live.js` | verifică coerența de mai sus |

`STRIPE_WEBHOOK_SECRET` merge **doar** în `.env` pe server. Nu în repo, nu în
`config.js`, nu în workflow.
