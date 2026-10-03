# AutoAct — Blueprint Tehnic de Producție (RO)

> **Pachet acte transcriere auto în 60 s** · Preț: 49 RON · Cost fix operațional: **0 RON** (exclusiv Free Tier)
> Echipă AI: Vision Eng. · NLP Eng. · Automation Arch. · DevSecOps Eng. · Growth Hacker
> **Decizia finală aparține Fondatorului (Human-in-the-Loop).**

**Fișiere livrate pe disc, testate și funcționale:**

| Fișier | Rol |
|---|---|
| `module-1/profil-tranzactie.schema.json` | Schema JSON validă (draft-07, parsare verificată) |
| `module-1/genereaza-cnp-test.js` | Generator Test Data Kit (rulare: `node module-1/genereaza-cnp-test.js`) |
| `module-1/test-data-kit.json` | 5 CNP-uri fictive, matematice valide, verificate (generat de scriptul de deasupra) |
| `module-1/populeaza-tranzactie-demo.js` | Demo end-to-end: profil de tranzacție complet + 6 verificări automate |
| `module-2/cnp-validator.code-node.js` | Validator CNP pentru nodul n8n „Code” |
| `module-2/zip-store.code-node.js` | Arhivare ZIP fără dependențe pentru nodul n8n „Code” |
| `module-2/build-workflow.js` | Generatorul workflow-ului n8n (rulare: `node module-2/build-workflow.js`) |
| `module-2/autoact-workflow.json` | Workflow n8n importabil (File → Import from File) — 11 noduri + 3 sticky |
| `module-2/test-cnp-validator.js` | 90 de verificări automate CNP (rulare: `node module-2/test-cnp-validator.js`) |
| `module-2/test-pipeline-e2e.js` | Simulare END-TO-END a pipeline-ului: 35 verificări pe 4 scenarii (OCR fake degradat, Gemini fake, codurile nodurilor reale) |
| `module-2/sabloane/` | Conținutul celor 3 șabloane Google Docs + harta canonică de 37 placeholder-e (`placeholders.json`) + README de setup |
| `module-2/verifica-sabloane.js` | Verificare șabloane ↔ hartă ↔ profil demo (55 verificări) |
| `config-autoact.js` | **Banca de cifre** — cititorul UNIC al prețului din `site/config.js`, pentru tot codul Node |
| `site/test-banca-cifre.js` | Guard de conținut: nicio cifră în textul public fără origine în cod + NAP verificat prin egalitate cu config.js (56 verificări, 7 mutații de cifră + 5 de NAP) |
| `config-autoact.js` | **Cititorul UNIC** al `site/config.js` pentru Node: preț + NAP + retenție GDPR, cu validarea cifrei de control a CIF-ului (cheia canonică 753217532) |
| `site/index.sablon.html`, `site/contact.sablon.html` | Surse de editat ale paginilor (tokenuri `{{PRET_RON}}`, `{{CIF}}`…) — `.html`-urile se generează |
| `site/contact.html` | Pagină de contact generată (NAP din config.js + FAQ) |
| `site/` | Pagina statică Zero-Refund: chestionar + pre-vizualizare + demo standalone (vezi `site/README.md`) |
| `module-3/docker-compose.yml` | Stack complet: n8n + PostgreSQL + Caddy (SSL automat) |
| `module-3/caddy/Caddyfile` | Config Caddy: TLS Let's Encrypt + proxy spre n8n |
| `module-3/deploy-autoact.sh` | Bootstrap one-shot pe instanța Oracle Cloud |
| `module-4/gdpr-purge.sql` | Curățare GDPR — SQL pur (nod Cron n8n + PostgreSQL) |
| `module-4/gdpr-purge.code-node.js` | Curățare GDPR — varianta nod Code n8n |
| `module-5/plati-schema.sql` | Tabela `plati_procesate` (idempotency) + coloane adresă pentru facturare |
| `module-5/build-workflow-plati.js` | Generatorul workflow-ului de plăți (rulare: `node module-5/build-workflow-plati.js`) |
| `module-5/autoact-workflow-plati.json` | Workflow n8n importabil: Stripe → semnătură → idempotency → Docs ×3 → PDF → ZIP → Gmail (22 noduri; facturarea e a Stripe) |
| `module-5/test-e2e-idempotency.js` | **Scenariul 5+6 E2E contra PostgreSQL REAL** (container efemer, docker): idempotency pe `order_id` cu query-ul extras din workflow + efectul real al job-ului GDPR — 27 verificări |
| `ruleaza-teste.sh` | Runner-ul unic al tuturor suitelor — folosit identic local și de CI |
| `LAUNCH.md` | Planul de lansare: ordine cu dependențe, blocaje critice, rollback, checklist pre-GO (cifrele lui sunt verificate de `site/test-banca-cifre.js`) |
| `.github/workflows/ci.yml` | CI GitHub Actions: suita completă la fiecare push și PR |

---

## MODULE 1 — Database Schema (JSON) & Test Data Kit

### 1.1 Profil Unic de Tranzacție Auto — JSON Schema (draft-07)

Schema completă, validă sintactic, se află în `module-1/profil-tranzactie.schema.json`. Punctele-cheie:

- **`date_vanzator` / `date_cumparator`** (`#/definitions/persoana`, obligatorii): `nume_complet`, `cnp` (`^[1-6][0-9]{12}$`), `serie_ci` (`^[A-Z]{2}$`), `numar_ci` (`^[0-9]{6}$`), `adresa`, `localitate`, `judet`, `siruta` (opțional), `telefon` (`^\+40[0-9]{9}$`), `email`.
- **`date_vehicul`** (obligatoriu): `marca`, `model`, **`vin` cu pattern `^[A-HJ-NPR-Z0-9]{17}$`** (literele I, O, Q interzise — ISO 3779, nivelul schemă, nu doar prompt), `numar_inmatriculare`, `an_fabricatie`, `cilindree_cm`, `putere_kw`, `masa_maxima_kg`, `odometru_km`, `tip_combustibil`, serie certificat înmatriculare.
- **`date_tranzactie`** (obligatoriu): `suma_ron` (> 0), `data_vanzarii`, `localitate_incheiere`, `siruta`, `scutire_taxa_sub_24_luni`, `este_persoana_fizica` (const true), **`acord_client` (const true — fluxul nu poate livra fără asumarea legală de pe ecranul de pre-vizualizare)**, `id_plata`, `scor_calitate`.
- **`stare`** modelează întregul ciclu de viață GDPR: `webhook_primit → ocr_in_procesare → ocr_gata → validare_ok → cerere_corectii_client → platit → livrat → epirat_gdpr` (ultimul stadiu după curățarea automată din Modulul 4).

### 1.2 Test Data Kit — 5 CNP-uri fictive, matematice valide

Generate determinist de `module-1/genereaza-cnp-test.js` și **recalibrate cu propriul validator din Modulul 2** (cheia `279146358279`, rest % 11, rest 10 → cifra de control 1). Codurile de județ respectă SIRUTA: 41/45 = Sectoare București, 12 = Caraș-Severin, 36 = Argeș, 23 = Gorj.

| # | Rol | CNP fictiv | Derivat din CNP |
|---|-----|-----------|-----------------|
| 1 | Vânzător #1 (test) | `1750314411231` | bărbat, 14.03.1975, jud. 41 (București Sector 1) |
| 2 | Cumpărător #1 (test) | `6010902122043` | femeie, 02.09.2001, jud. 12 (Caraș-Severin) |
| 3 | Vânzător #2 (test) | `2881123360175` | femeie, 23.11.1988, jud. 36 (Argeș) |
| 4 | Cumpărător #2 (test) | `5030530234568` | bărbat, 30.05.2003, jud. 23 (Gorj) |
| 5 | Test secol 1900 / Sector 5 | `1650108450909` | bărbat, 08.01.1965, jud. 45 (București Sector 5) |

Fiecare intrare din `module-1/test-data-kit.json` include și nume/adresă fictive coerente, serie CI, VIN de 17 caractere fără I/O/Q și plăcuță — suficiente pentru un test end-to-end al întregului pipeline. **Disclaimer: date 100% fictive; nu folosi CNP-uri reale în medii de test.**

---

## MODULE 2 — Pipeline AI Pasiv (n8n Core), Prompt Gemini & Script CNP

**Flux n8n (11 noduri), toate pe planul gratuit / self-hosted:**

```
[1 Webhook] → [2 Cod: decodare base64] → [3 HTTP: Vision OCR]
    → [4 HTTP: Gemini Flash] → [5 Code: validare CNP + scor]
    → [6 IF: scor ≥ 95 ȘI CNP valid?]
         ├─ false → [7 Respond to Webhook: ecran „Corectează datele”]  (fallback pasiv la client)
         └─ true  → [8 IF: plată confirmată?]
                      ├─ false → [9 Respond to Webhook: ecran plată / Payment Link Stripe]
                      └─ true  → [10 Code: Docs → PDF → ZIP] → [11 Gmail: e-mail livrare + factură]
```

### 2.1 Trigger — Webhook UI

- Nod **Webhook**: method `POST`, path `test-ui`, Response Mode `Using 'Respond to Webhook' node`, Authentication `Header Auth` (header `X-AutoAct-Key` — secret generat la deploy, vezi Modulul 3).
- Interfața gratuită de formulare (Tally sau Grist self-hosted pe același server) postează `multipart/form-data` cu 5 fișiere: `ci_fata`, `ci_verso`, `civ_fata`, `civ_verso`, `talon`.
- **HTTP Request → setează `Send Body` → `Form Data` → `Binary Data` = ON**, iar `Input Data Field Name` ia valoarea numelui câmpului (`ci_fata` etc.).

### 2.2 Nod „Code” — decodare fișiere (gratuit, nelimitat)

Webhook-ul livrează binar; nodul următor le transformă în base64 pentru API-urile Vision (input de pe nodul Webhook, deci referința este `$binary`):

```javascript
for (const item of items) {
  if (!item.binary) continue;
  for (const cheie of Object.keys(item.binary)) {
    const data = item.binary[cheie];
    const buffer = await this.helpers.getBinaryDataBuffer(0, cheie);
    item.json[cheie + '_b64'] = buffer.toString('base64');
    item.json[cheie + '_mime'] = data.mimeType || 'image/jpeg';
  }
  delete item.binary;
}
return items;
```

### 2.3 Modul Vision (OCR) — GPT-4o-mini (credit gratuit) cu fallback Google Vision

Nod **HTTP Request**: `POST https://api.openai.com/v1/chat/completions`, Auth `Header Auth` (cheia OpenAI în n8n Credentials — niciodată în flux). Body JSON:

```json
{
  "model": "gpt-4o-mini",
  "max_tokens": 1800,
  "temperature": 0,
  "messages": [{
    "role": "user",
    "content": [
      { "type": "text", "text": "Extrage DOAR textul vizibil din documentele romanesti atasate (CI fata/verso, CIV, talon). Fara interpretare, fara comentarii, fara markdown. Reproduci exact cifrele si literele, inclusiv CNP-ul si seria, asa cum apar." },
      { "type": "image_url", "image_url": { "url": "data:{{ $json.ci_fata_mime }};base64,{{ $json.ci_fata_b64 }}" } },
      { "type": "image_url", "image_url": { "url": "data:{{ $json.ci_verso_mime }};base64,{{ $json.ci_verso_b64 }}" } },
      { "type": "image_url", "image_url": { "url": "data:{{ $json.civ_fata_mime }};base64,{{ $json.civ_fata_b64 }}" } },
      { "type": "image_url", "image_url": { "url": "data:{{ $json.civ_verso_mime }};base64,{{ $json.civ_verso_b64 }}" } },
      { "type": "image_url", "image_url": { "url": "data:{{ $json.talon_mime }};base64,{{ $json.talon_b64 }}" } }
    ]
  }]
}
```

**Fallback 100% gratuit, nelimitat:** dacă OpenAI refuză (limită de credit), traseul alternativ este Google Cloud Vision (1 000 pagini/lună gratuite) sau Tesseract.js (`tesseract.js` cu pachetul de limbă `ron`) rulat local pe serverul Oracle — cost 0. Se implementează cu un nod **IF** după codul de stare HTTP.

### 2.4 Subagent Gemini — corecție diacritice, VIN, SIRUTA

Nod **HTTP Request**: `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={{ $credentials.gemini_api_key }}` (Google AI Studio, plan gratuit). Body JSON:

```json
{
  "system_instruction": { "parts": [{ "text": "Esti un motor de curatare a datelor extrase OCR din documente romanesti. Raspunzi EXCLUSIV cu JSON valid, fara markdown, fara explicatii." }] },
  "contents": [{ "role": "user", "parts": [{ "text": "Text OCR brut:\n{{ $json.choices[0].message.content }}\n\nSarcini:\n1) Repara diacriticele romanesti (a, e, i, s, t cu sedila/circonflex) in nume, prenume, strazi, localitati (ex: 'Bucuresti' → 'București', 'Cluj Napoca' → 'Cluj-Napoca').\n2) VIN: are EXACT 17 caractere. Literele I, O, Q sunt INTERZISE in VIN (ISO 3779): daca OCR le-a citit, inlocuieste 'O'→'0', 'Q'→'0', 'I'→'1'. Verifica lungimea 17.\n3) Numere de inmatriculare: normalizeaza la formatul RO (ex: 'b123abc' → 'B-123-ABC').\n4) Localitati: valideaza contra listei SIRUTA (denumiri oficiale Romania); daca localitatea nu exista, pune campul 'localitate_siruta_ok': false.\n5) Nu inventa date: campurile lipsa raman null.\n\nReturneaza EXCLUSIV acest JSON:\n{\"date_vanzator\":{\"nume_complet\":\"\",\"cnp\":\"\",\"serie_ci\":\"\",\"numar_ci\":\"\",\"adresa\":\"\",\"localitate\":\"\",\"judet\":\"\"},\"date_cumparator\":{...aceleasi campuri...},\"date_vehicul\":{\"marca\":\"\",\"model\":\"\",\"vin\":\"\",\"numar_inmatriculare\":\"\",\"an_fabricatie\":null,\"cilindree_cm\":null,\"putere_kw\":null,\"masa_maxima_kg\":null,\"odometru_km\":null,\"tip_combustibil\":\"\"},\"date_tranzactie\":{\"data_vanzarii\":\"\",\"localitate_incheiere\":\"\"},\"localitate_siruta_ok\":true,\"campuri_nesigure\":[\"lista campuri cu incredere scazuta\"]}"}] }]
}
```

- `campuri_nesigure` alimentează direct evidențierea galbenă de pe ecranul Zero-Refund (Modulul 6).
- Configurare conexiune: nodul Gemini primește input de la nodul Vision (deci `{{ $json.choices[0].message.content }}` este disponibil nativ).

### 2.5 Modul Script Validare Matematică CNP (nod „Code” n8n)

Cod complet, gata de lipit: **`module-2/cnp-validator.code-node.js`**. Algoritm implementat exact conform specificației:

1. Primele 12 cifre se înmulțesc, poziție cu poziție, cu cheia standard `279146358279`;
2. Produsele se adună; suma se împarte la 11 și se reține restul;
3. Dacă restul este `10`, cifra de control este `1`, altfel cifra de control este restul;
4. Se compară cu a 13-a cifră → `isValid: true/false` (+ `erori[]` detaliate și `meta` cu sex/dată/județ derivat).

Fragment-cheie (fișierul complet e pe disc, testat):

```javascript
const CHEIE = '279146358279'.split('').map(Number);
let suma = 0;
for (let i = 0; i < 12; i++) suma += cifre[i] * CHEIE[i];
const rest = suma % 11;
const cifraControl = rest === 10 ? 1 : rest;
out.isValid = cifraControl === cifre[12];
```

Validează suplimentar: format 13 cifre, `S ∈ 1–6`, dată calendaristică reală (inclusiv 29 februarie pentru ani bisecți), `JJ ∈ 01–52`.

Suita de regresie: `node module-2/test-cnp-validator.js` — **90 de verificări, toate PASS**, rulate prin AMBELE implementări (n8n + UI, output identic obligatoriu): ani bisecți (29.02.2000/2024 valizi; 29.02.1900/2023 respinși; 31.04 respins), rest 10 → cifra de control 1 (cu 0 respins), S ∈ {0,7,8,9}, județ 53/99/00 respinși + 01/52 valizi, lungimi 0/5/12/14 + litere + null/undefined + coercție numerică, 12 mutații checksum + cifră de control coruptă.

### 2.6 Router Fallback la Client (pasiv, fără alerte admin)

Nod **IF** cu condiția: `{{ $json.cnp_valid_tot }}` (Boolean, true) **AND** `{{ $json.scor_calitate }}` (Number, larger or equal, `95`). Ramura **false** duce la nodul *Respond to Webhook* care returnează JSON-ul cu `campuri_nesigure` și `cnp_erori` direct în UI: clientul corectează inline pe ecranul de pre-vizualizare (Modulul 6), bifează acordul și plătește. **Niciun canal de alertare, niciun admin implicat** — cerință „pasiv” respectată. Ramura **true** continuă spre plată/generare documente.

### 2.7 Document Engine & Delivery (Free Tiers)

- **Șabloane Google Docs** (gratuit, cont standard): contract vânzare-cumpărare auto (2 exemplare), cerere DRPCIV, declarație fiscală — **conținutul complet, redactat și pe disc în `module-2/sabloane/`**: `contract-vanzare-cumparare-auto.md`, `cerere-drpciv.md`, `declaratie-fiscala.md`, plus **harta canonică `placeholders.json`** (37 placeholder-e `{{nume}}` → căi în Profilul de Tranzacție). Setup-ul în Google Docs + fluxul `batchUpdate → export PDF → ZIP`: `module-2/sabloane/README.md`. Nodul „Documente ZIP" din workflow generează obiectul `valori` cu aceeași hartă, iar `node module-2/verifica-sabloane.js` garantează sincronizarea (55 verificări: tokeni ⊆ hartă, căi rezolvabile pe profilul demo, zero placeholder-e necompletate după înlocuire).
- **Flux**: nod HTTP `POST https://docs.googleapis.com/v1/documents/{id}/batchUpdate` (batchUpdate cu `replaceAllText` pentru fiecare placeholder) → export PDF `GET https://docs.google.com/document/d/{id}/export?format=pdf` → nod **Code** cu `module-2/zip-store.code-node.js` → arhiva ZIP a 4 PDF-uri.
- **ZIP fără dependențe**: constructor ZIP nativ (metoda STORE, CRC32 implementat manual) — testat: `unzip -t` trece pe arhiva generată. Necesită doar `NODE_FUNCTION_ALLOW_BUILTIN=fs,path` în docker-compose (Modulul 3). Exemplul de apel este în coada fișierului.
- Livrarea ZIP-ului se face ca atașament în e-mailul tranzacțional (Modulul 5) prin nodul Gmail din n8n — sau, pentru fișiere mari, link semnat Google Drive (gratuit) cu expirare 48 h.

### 2.8 Workflow-ul n8n importabil (File → Import from File)

Fișier: **`module-2/autoact-workflow.json`** — generat de `node module-2/build-workflow.js` (14 noduri: 11 pipeline + 3 sticky notes cu instrucțiuni). Builder-ul rulează 10 auto-validări la fiecare generare.

**Import:**

1. n8n → meniul ⋯ → **Import from File** → `autoact-workflow.json`.
2. Atribuie credentials (workflow-ul vine cu placeholder-e, nu cu chei reale):
   - **Vision OCR** → Header Auth: `Authorization: Bearer sk-...` (OpenAI);
   - **Gemini Curatare** → Query Auth: Name `key`, Value `AIza...` (Google AI Studio);
   - **Gmail Livrare** → Gmail OAuth2 (contul de trimitere).
3. (Recomandat) Pe nodul **Webhook UI**: Authentication → Header Auth cu `X-AutoAct-Key` (secretul din Modulul 3).
4. Salvează + activează → Production URL: `https://autoact.eu/webhook/test-ui`.

**Ce conține fiecare nod (toate valorile pre-configurate):**

| # | Nod | Configurare-cheie |
|---|---|---|
| 1 | Webhook UI | POST `test-ui`, Response Mode „Respond to Webhook node” |
| 2 | Decodare fisiere | Code: 5 binare → `{camp}_b64` + `{camp}_mime`; respinge webhook-uri incomplete (< 5 fișiere) |
| 3 | Vision OCR | GPT-4o-mini, temperature 0, cele 5 imagini ca data URI, timeout 60 s |
| 4 | Gemini Curatare | gemini-2.0-flash, Query Auth `key=`, prompt complet diacritice / VIN fără I-O-Q / SIRUTA |
| 5 | Validator CNP | Algoritmul din §2.5 + scor: `100 − 8×campuri_nesigure − 15 (CNP invalid)` |
| 6 | IF Scor & CNP | scor ≥ 95 AND cnp_valid_tot = true |
| 7 | Fallback Client | JSON către UI: `campuri_nesigure`, `cnp_erori`, toate datele (ramura false) |
| 8 | IF Plata | `plata_confirmata === true` (true la reintrarea webhook-ului Stripe) |
| 9 | Respond Plata | `url_plata` = Payment Link Stripe cu `client_reference_id` (ramura false) |
| 10 | Documente ZIP | payload placeholder-e Google Docs (§2.7) + destinatar |
| 11 | Gmail Livrare | e-mailul de livrare (§5.2) către `date_cumparator.email` |

**Auto-validările builder-ului (rulate, toate PASS):** JSON re-parse (14 noduri), graf conex (10 muchii, 11/11 accesibile de la Webhook), simularea nodului 2 (5 × `_b64` generate + eroare pe webhook incomplet) și a nodului 5 (CNP din Test Data Kit → `cnp_valid_tot` + scor 92; CNP corupt → scor 77 + erori detaliate).

---

## MODULE 3 — Ghid DevSecOps: n8n Self-Hosted pe Oracle Cloud Free Tier

> **Sumar:** 1 VM Ampere A1 (2 OCPU / 12 GB RAM, Always Free) · VCN cu 2 Ingress Rules (80/443) · Docker Compose cu 3 servicii (n8n + PostgreSQL + Caddy) · un singur script de bootstrap + comenzi SSH esențiale.

### 3.1 Instanța Oracle Cloud (Always Free Tier) — pas cu pas

1. **Cont:** cloud.oracle.com → „Start for free”. Cardul este pre-autorizat, nu debitat (verificare anti-abuz). Regiune recomandată: `eu-frankfurt-1` sau `eu-paris-1` (latență bună spre RO + date găzduite în UE → GDPR). *Regiunea se alege la creare și NU poate fi schimbată ulterior.*
2. **Compartment** (opțional, pentru ordine): Console → Identity → Compartments → `autoact-prod`.
3. **Instanța:** Compute → Instances → Create Instance.
   - **Shape:** `VM.Standard.A1.Flex` (Ampere A1), **2 OCPU + 12 GB RAM** — contingentul Always Free **în limita actuală**. ⚠️ Oracle a redus limita la 1.500 OCPU-ore / 9.000 GB-ore pe lună (2 OCPU / 12 GB) pe **15 iunie 2026**, fără anunț public. Un cont Free-only cu 4/24 este **oprit automat**; pe un cont PAYG poate genera **facturi fără știrea ta**. Nu depăși 2/12 — `verifica-cost-0.js` (pasul 13 din runner) verifică acest lucru la fiecare rulare.
   - **OS:** Ubuntu 22.04 LTS minimal (aarch64).
   - **SSH key:** încarci cheia publică la creare (obligatorie pentru pasul 3.3).
   - **Boot volume:** implicit ~47 GB (contingentul total Always Free: 200 GB block storage).
4. **VCN & rețea:** la creare, lasă „Create new VCN” activ; apoi Networking → Virtual Cloud Networks → VCN-ul instanței → Security Lists → Default Security List → **Add Ingress Rules**:

   | Source CIDR | Protocol | Dest. Port | Scop |
   |---|---|---|---|
   | `0.0.0.0/0` | TCP | 80 | Redirect HTTP→HTTPS + challenge ACME (Let's Encrypt) |
   | `0.0.0.0/0` | TCP | 443 | UI n8n + webhook-uri (Stripe) |

   ⚠️ **Nu deschide portul 5678** (n8n nativ): n8n rămâne în rețeaua internă Docker; singura poartă publică este Caddy (reverse proxy cu SSL automat).
5. **DNS:** la registrar (ex. Cloudflare/ClouDNS): `A autoact.eu → IP public instanță`, `A www → același IP`, TTL 300. Caddy emite certificatul Let's Encrypt doar după ce DNS-ul rezolvă corect domeniul spre IP-ul instanței.
6. **(Recomandat) Backup gratuit:** Boot Volume Backups cu policy „Bronze” — inclus în Always Free.

> **Capcană cunoscută:** VM-urile A1 gratuite sunt frecvent „out of capacity” în anumite momente. Dacă provisioning-ul eșuează, reîncearcă la intervale de 2–3 ore sau schimbă Availability Domain. Nu accepta shape-ul „E2.1.Micro” ca substitut pentru pipeline — e insuficient pentru OCR + n8n.

### 3.2 `docker-compose.yml` complet (n8n + PostgreSQL + Caddy)

Fișierul complet, gata de deploy: **`module-3/docker-compose.yml`**. Puncte-cheie:

- **n8n** (`n8nio/n8n:latest`, imagine multi-arch — rulează nativ pe ARM64): `N8N_HOST=autoact.eu`, `N8N_PROXY_HOPS=1`, `WEBHOOK_URL=https://autoact.eu/`, `NODE_FUNCTION_ALLOW_BUILTIN=fs,path,crypto` (necesar pentru zip-store din Modulul 2.7 și verificarea semnăturii Stripe din Modulul 5.1bis), `EXECUTIONS_DATA_PRUNE=true`, `EXECUTIONS_DATA_MAX_AGE=48` — n8n își curăță singur execuțiile mai vechi de 48 h.
- **PostgreSQL 16-alpine** cu volum dedicat `pgdata`; n8n se conectează prin `DB_TYPE=postgresdb`. Alternativa SQLite internă e OK pentru lansare, dar PG oferă backup/migrare curată.
- **Caddy** (`caddy:2-alpine`) cu Caddyfile minimal montat din `./caddy/Caddyfile`: reverse proxy → `n8n:5678`, TLS automat Let's Encrypt, redirect 80→443.
- Volum `local_files` → `/home/node/local` în containerul n8n (zona de lucru provizorie pentru ZIP-uri; curățată de job-ul GDPR din Modulul 4).
- Secret: `N8N_ENCRYPTION_KEY` în `.env` — **backup obligatoriu**: fără el, credentials-urile n8n nu mai pot fi decriptate pe o VM nouă.

### 3.3 Script de bootstrap + comenzi SSH esențiale

Un singur script face tot — de la VM proaspătă la HTTPS funcțional. Fișier complet: **`module-3/deploy-autoact.sh`** (instalează Docker + Compose, scrie `.env` cu chei generate, scrie Caddyfile, copiază docker-compose.yml, pornește stack-ul, verifică sănătatea).

```bash
# De pe calculatorul local, din directorul module-3/:
chmod +x deploy-autoact.sh
./deploy-autoact.sh ubuntu@IP_PUBLIC_AUTOACT autoact.eu
# Scriptul se conectează prin SSH, instalează totul și pornește stack-ul.
# VM-urile A1 gratuite dau uneori "out of capacity" — reia pasul de creare a instanței, apoi rerulează scriptul.
```

**Comenzile SSH esențiale (pe instanță, ca utilizator `ubuntu`):**

```bash
cd ~/autoact
sudo docker compose ps                        # starea containerelor
sudo docker compose logs -f n8n               # loguri n8n live
sudo docker compose restart n8n               # restart doar n8n
sudo docker compose down && sudo docker compose up -d   # restart complet
sudo docker compose exec n8n n8n export:workflow --all > backup-workflows.json  # backup fluxuri
sudo docker compose exec -T postgres pg_dump -U autoact autoact > backup-db.sql # backup DB
cat caddy/Caddyfile | sudo docker compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile  # validare config
```

---

## MODULE 4 — Script Cron Job GDPR (Curățare Automată Date)

### 4.1 Logica de curățare (intervenție zero)

- Frecvență: **la 24 de ore** (nod Cron n8n, expresie `0 4 * * *` → zilnic 04:00 Europe/Bucharest, trafic minim).
- Criteriu: tranzacțiile cu `stare = 'livrat'` livrate de **mai mult de 48 de ore** (`livrat_la < NOW() - INTERVAL '48 hours'`).
- Acțiuni, în ordine, într-o singură tranzacție SQL:
  1. șterge definitiv fișierele atașate (poze CI/CIV/talon) — rândurile din `tranzactii_fisiere` + conținutul de pe disc (`/home/node/local/{id_tranzactie}/`);
  2. golește (hard-anonymizează) datele personale sensibile: **CNP, serie CI, număr CI, nume, adresă, telefon, e-mail** — overwrite cu `[GDPR_PURGED]`, nu soft-delete;
  3. păstrează exclusiv pentru contabilitate: `id_tranzactie`, `suma_ron`, `data_vanzarii` (+ an/lună pentru registrul fiscal);
  4. marchează `stare = 'epirat_gdpr'` + `epirat_la = NOW()` (audit trail minim, fără PII).
- Motivația pragurilor: fișierele nepătărite se curăță la 72 h (abandon coș, Modulul 5); cele livrate, la 48 h post-livrare — clientul are timp să descarce ZIP-ul, apoi datele dispar.

### 4.2 Varianta SQL pură (nod Cron n8n + PostgreSQL)

Fișier complet: **`module-4/gdpr-purge.sql`** — BEGIN/COMMIT, schema minimă `tranzactii` + `tranzactii_fisiere`, politica de retenție comentată, funcția `purge_gdpr()` (CTE-uri cu `DELETE ... RETURNING` pe fișiere, `UPDATE` de anonimizare, schimbare de stare) și tabelul de log `gdpr_purge_log`. Nucleul:

```sql
WITH fisiere_de_sters AS (
  DELETE FROM tranzactii_fisiere
  WHERE tranzactie_id IN (
    SELECT id_tranzactie FROM tranzactii
    WHERE stare = 'livrat' AND livrat_la < NOW() - INTERVAL '48 hours'
  )
  RETURNING tranzactie_id, cale_fisier
)
SELECT tranzactie_id, cale_fisier, 'deleted' AS actiune FROM fisiere_de_sters;

UPDATE tranzactii SET
  cnp_vanzator = '[GDPR_PURGED]', cnp_cumparator = '[GDPR_PURGED]',
  nume_vanzator = '[GDPR_PURGED]', nume_cumparator = '[GDPR_PURGED]',
  serie_numar_ci_vanzator = '[GDPR_PURGED]', serie_numar_ci_cumparator = '[GDPR_PURGED]',
  adresa_vanzator = '[GDPR_PURGED]', adresa_cumparator = '[GDPR_PURGED]',
  telefon_vanzator = '[GDPR_PURGED]', telefon_cumparator = '[GDPR_PURGED]',
  email_vanzator = '[GDPR_PURGED]', email_cumparator = '[GDPR_PURGED]',
  stare = 'epirat_gdpr', epirat_la = NOW()
WHERE stare = 'livrat' AND livrat_la < NOW() - INTERVAL '48 hours';
```

> **Bug prins și reparat prin rulare reală** (scenariul 6 din `module-5/test-e2e-idempotency.js`): CTE-ul `logare` făcea `RETURNING fisiere_sterse, tranzactii_epurate`, dar interogarea finală selecta `id_rulare` din el — `ERROR: column "id_rulare" does not exist`, deci job-ul GDPR ar fi aruncat eroare la **fiecare** rulare în producție. Corectat: `RETURNING id_rulare, ...`. Testul rulează acum job-ul pe date reale și verifică efectul (PII epurată, fișiere șterse, log scris), nu doar faptul că nu aruncă.

Programare în n8n: nod **Schedule Trigger** (`0 4 * * *`) → nod **Postgres** (Operation: Execute Query) cu conținutul fișierului → nod **IF** (`row_count > 0`) → nod **Gmail** către `founder@autoact.eu` cu rezumatul „GDPR purge: N tranzacții epurate” (e-mail de audit, nu alertă de intervenție).

### 4.3 Varianta nod „Code” n8n (Node.js, șterge și fișierele de pe disc)

Fișier complet: **`module-4/gdpr-purge.code-node.js`** — parcurge execuțiile cu vârstă > 48 h, șterge recursiv `/home/node/local/{id_tranzactie}/` via `fs.rmSync(..., { recursive: true, force: true })`, suprascrie PII din item, returnează raport. Se rulează după nodul Postgres ca să sincronizeze discul cu DB. Necesită `NODE_FUNCTION_ALLOW_BUILTIN=fs,path` (deja setat în Modulul 3). Bonus: curăță și eventuale ZIP-uri orfane mai vechi de 48 h din `/home/node/local/`.

---

## MODULE 5 — Plăți Stripe (Merchant of Record) & E-mailuri Tranzacționale

### 5.1 Fluxul de plată (zero-intervenție)

```
[UI: client plătește 49 RON] → [Stripe: Payment Link] → [Stripe → webhook POST https://autoact.eu/webhook/stripe]
   → [n8n Webhook RAW BODY] → [Code: verificare semnătură Stripe] → [IF: semnătură validă]
        ├─ nu  → [Respond 400]                          (fără alerte admin)
        └─ da  → [idempotency] → [IF: payment_status == 'paid' && suma == 49 RON && moneda == 'RON']
                     ├─ nu → [Respond 200 silentios]    (fallback-ul rămâne la client)
                     └─ da → [Docs ×3 → PDF → ZIP → Gmail: pachetul + instrucțiuni]
```

**Facturarea NU e în acest workflow.** Stripe rulează cu „**Managed Payments**" (Merchant of
Record): el este vânzătorul de drept, emite **factura și chitanța cu TVA** și le trimite
clientului la plată. Un nod de facturare aici ar produce un **al doilea document fiscal**
pentru aceeași plată.

**Stripe (webhook):**

- Endpoint: `POST https://autoact.eu/webhook/stripe`, eveniment `checkout.session.completed`.
- **RAW BODY obligatoriu**: antetul `Stripe-Signature` e HMAC-SHA256 peste **octeții exacti**
  ai body-ului. Un JSON parsat și re-serializat are altă ordine a cheilor → alt hash → fiecare
  plată ar fi respinsă. De aceea nodul Webhook are `rawBody: true`, iar un body care ajunge
  obiect (nu Buffer) e **respins**, nu „reconstruit".
- Comparația se face cu `crypto.timingSafeEqual` (constantă în timp) și antetele mai vechi de
  **300 s** sunt respinse — altfel un body capturat ar putea fi reluat oricând drept plată nouă.
- Necesită `NODE_FUNCTION_ALLOW_BUILTIN=fs,path,crypto` (deja în docker-compose, Modulul 3)
  și env-ul `STRIPE_WEBHOOK_SECRET` (Signing secret din contul Stripe).
- **Legătura plată ↔ dosar:** Payment Link-ul primește `?client_reference_id=<id_tranzactie>`,
  iar evenimentul îl aduce înapoi ca `order_id`. Fără el, evenimentul e marcat „fără tranzacție"
  și respins de IF — nu se generează documente pentru o plată orfană.
- **Suma** vine în unități mici (`amount_total: 4900`) și în notația minorității (`ron`);
  normalizarea în lei + RON se face **într-un singur nod**, nu în fiecare consumator.
- **Idempotență:** n8n ține evidența `order_id`-urilor procesate în PostgreSQL — dublul webhook
  (retransmisii Stripe) NU generează pachete livrate de două ori.

### 5.1bis Workflow-ul de plăți importabil (File → Import from File)

Fișier: **`module-5/autoact-workflow-plati.json`** — generat de `node module-5/build-workflow-plati.js`
(18 noduri pipeline + 4 sticky = 22, ~40 de auto-validări la fiecare generare).

```
[1 Webhook Stripe (raw)] → [2 Verificare Semnătură]
   → [3 IF Semnătură Validă]
        ├─ false → [4 Respond 400]                          (fără alerte admin)
        └─ true  → [5 Idempotență: INSERT ON CONFLICT DO NOTHING RETURNING]
                     → [6 IF Deja Procesată]
                          ├─ true  → [7 Respond 200 {duplicat:true}]
                          └─ false → [8 Data Tranzacție (Postgres)]
                                       → [9 IF Plată Confirmată (status=confirmed, moneda=RON, suma=49)]
                                            ├─ false → [10 Respond 200 {factura:false}]
                                            └─ true  → [11 Date Livrare] → [12 Placeholder-e Docs] → … → [18 Gmail Livrare ZIP]
```

- **Nodul 2 (semnătura):** HMAC-SHA256(`STRIPE_WEBHOOK_SECRET`, `"<t>.<body>"`) peste Buffer-ul
  brut, comparat cu `timingSafeEqual`. Abia **după** potrivire evenimentul e parsat și
  normalizat (`suma`, `moneda`, `order_id`, `email`).
- **Nodul 5 (idempotency):** `INSERT ... ON CONFLICT (order_id) DO NOTHING RETURNING` pe tabela
  `plati_procesate` din `module-5/plati-schema.sql` — cu fallback `UNION ALL`, ca răspunsul să
  fie mereu exact 1 rând (altfel IF-ul rămâne fără input). Retransmisia primește
  `{ok, duplicat:true}` și oprește fluxul **înainte** de generarea documentelor.
- **Nodul 8 (Postgres):** aduce profilul complet (`profil_json`) + coloanele aplatizate + **e-mailul
  din evenimentul Stripe** (`email_plata`) — checkout-ul e locul unde clientul își dă adresa reală.
- **Nodul 11 (Date Livrare):** alegă destinatarul (dosarul are prioritate, altfel adresa de la
  plată) și **se oprește cu mesaj explicit** dacă nu există niciuna — nu livrăm un ZIP fără
  destinatar și nu cheltuim creditele Google Docs degeaba.
- **Generarea documentelor (nodurile 12–18):** `Placeholder-e Docs` (37 înlocuiri × 3 documente
  din `profil_json` sau coloane aplatizate) → `Copie Template (Drive)` (template-urile NU se
  modifică niciodată) → `Docs batchUpdate` (replaceAllText ×37, matchCase) → `Export PDF (Drive)`
  (responseFormat file) → `Șterge Copia` (fără gunoi în Drive) → `ZIP Pachet` (zip-store inline,
  CRC32 + STORE, zero npm) → `Gmail Livrare ZIP` (atașament + instrucțiuni). ID-urile șabloanelor
  vin din env: `GOOGLE_DOCS_TEMPLATE_CONTRACT/_DRPCIV/_DECLARATII`.
  **Atenție la o capcană reală:** nodurile HTTP (Drive) *înlocuiesc* itemul cu răspunsul lor, deci
  până la `ZIP Pachet` se pierd **atât** metadatele puse înaintea lor (destinatar, nume, `nume_pdf`)
  **cât și binarele** — `Șterge Copia (Drive)` este tot un HTTP Request, așa că în `items` ajunge
  răspunsul DELETE, fără PDF. De aceea ZIP-ul citește **explicit** din `$('Export PDF (Drive)').all()`:
  numele din lista canonică `DOCUMENTE_DOCS` (poziția se păstrează, fiindcă fiecare nod procesează
  itemii în ordine) și **binarele de acolo**, iar metadatele de livrare din `$('Date Livrare')`.
  Fără destinatar, ZIP-ul **nu se construiește** — nu livrăm un pachet fără cineva; la fel, un export
  incomplet (2 din 3 PDF-uri) oprește fluxul înainte de a arde creditele Google pe un pachet lacună.
  Simularea din validator reproduce exact această realitate (`items` conține răspunsul DELETE, iar
  `helpers.getBinaryDataBuffer` **aruncă** ca să nu poată fi folosit pe furiș), iar patru mutații —
  întoarcerea la `items[0].json`, la `item.json.nume_pdf`, la binarele din `items` și scoaterea
  gardului de completitudine — fac validatorul să CADĂ, deci regresia nu poate trece neobservată.
- **Auto-validările builder-ului (toate PASS):** structură JSON (22 noduri), graf conex
  (17 muchii, 18/18 accesibile), cele 3 ramuri IF, **sintaxa validată pentru TOATE cele 17
  expresii**, și — cele mai importante — **9 sabotaje reale ale semnăturii** fiecare simulate
  cu `require('crypto')` adevărat: secret greșit, corp modificat cu antet valid, antet vechi
  de o oră, antet absent, secret neconfigurat, body parsat în loc de raw, sumă greșită,
  plată fără `client_reference_id`. Plus: simularea nodului 12 pe Test Data Kit
  (3 itemi × 37 replaceAllText, placeholder-ele = exact harta canonică), URL-urile reale ale
  nodurilor 13–16, ZIP cu semnăturile PK verificate + 3 intrări, și nodul 11 pe 4 scenarii
  de livrare (inclusiv lipsa e-mailului).
- **Prețul și suma vin din `config-autoact.js`** (`site/config.js`): `IF Plată Confirmată`
  compară suma cu `PRET_RON` **și** verifică moneda. O cifră scrisă cu gura în workflow ar
  însemna o plată acceptată la altă sumă decât cea afișată pe site.

**Prețul: 49 lei, TVA inclus** (`tax_behavior` pe produs). Decizia e măsurată pe Stripe
sandbox: 49,00 lei brute → tax reținut −8,50, procesare −2,54 → **net 37,96 lei** (fără
conversie de valută). Vezi LAUNCH.md §1.bis pentru comparația cu varianta în euro.

### 5.2 E-mailul de LIVRARE (la confirmarea plății — trimis pasiv din n8n)

 (la confirmarea plății — trimis pasiv din n8n)

> Trimis prin nodul **Gmail** din n8n (cont gratuit, 500 e-mail/zi) sau **Brevo** (300 e-mail/zi gratuit) — ambele OK pentru start.

- **Subiect:** `AutoAct — actele tale pentru transcriere auto sunt gata (ZIP)`
- **Factura NU se atașează** — vine separat, de la Stripe, pe adresa folosită la plată.
- **Body (HTML, gata de copy-paste):**

```html
<p>Bună, {{ $json.date_cumparator.nume_complet }},</p>

<p>Îți mulțumim pentru comandă. Pachetul tău de acte pentru transcrierea auto este gata și îl găsești atașat:</p>

<ul>
  <li><strong>01-contract-vanzare-cumparare.pdf</strong> — 2 exemplare (unul pentru vânzător, unul pentru cumpărător)</li>
  <li><strong>02-cerere-drpciv.pdf</strong> — cererea de transcriere către DRPCIV</li>
  <li><strong>03-declaratii-fiscale.pdf</strong> — declarațiile fiscale necesare</li>
  <li><strong>factura_AUTOACT.pdf</strong> — factura ta</li>
</ul>

<h3>Ce faci după ce printezi actele</h3>
<ol>
  <li><strong>Printează tot PDF-ul</strong> (singurul, fără fișier suplimentar).</li>
  <li>Nu semna încă — mergi ÎNTÂI cu mașina + actele originale (CI, CIV) la <strong>notar</strong> pentru autentificarea contractului (obligatoriu pentru transcriere).</li>
  <li>Semnați amândoi în fața notarului; plătiți onorariul notarial.</li>
  <li>Mergi la <strong>DRPCIV</strong> cu: contractul autentificat, CI + copie, CIV original, dovada plății taxei de transcriere (plătești la trezorerie/online).</li>
  <li>Primești noua înmatriculare — gata!</li>
</ol>

<p><strong>Important:</strong> actele au valoare doar printate pe hârtie + semnate conform pașilor de mai sus. Verifică cu atenție toate datele înainte de printare (nume, CNP, VIN, plăcuțe) — AutoAct nu poate fi tras la răspundere pentru date introduse greșit de client (termenii completi la autoact.eu/termeni).</p>

<p>Cu stimă,<br>
<strong>Echipa AutoAct</strong><br>
autoact.eu · support@autoact.eu</p>

<!-- Atașamente configurate în nodul Gmail: doar ZIP-ul generat în Modulul 2.7. Factura vine de la Stripe. -->
```

### 5.3 E-mailul de ABANDON COȘ (scansare făcută, plată nefinalizată)

> Trigger: nod **Schedule Trigger** (la 1h/24h după scanare fără plată, determinat din `stare` în PostgreSQL). Max 2 trimiteri; apoi auto-stop.

- **Subiect:** `Actele tale AutoAct așteaptă plătea — mai au nevoie de 2 minute`
- **Body (HTML):**

```html
<p>Bună, {{ $json.nume_client }},</p>

<p>Ai scanat actele pentru transcrierea mașinii ({{ $json.marca_model }}), dar comanda nu a fost finalizată. Datele extrase sunt <strong>salvate și te așteaptă</strong> — nu trebuie să rescanezi nimic.</p>

<p>Finalizează plata (49 RON) în 2 minute și primești pachetul complet în 60 de secunde:<br>
<a href="{{ $json.url_finalizare_plata }}" style="background:#1a73e8;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:8px;">Finalizează comanda</a></p>

<p>Dacă ai întâmpinat o problemă la plată sau la scanare, răspunde la acest e-mail — te ajutăm direct.</p>

<p>Cu stimă,<br>
<strong>Echipa AutoAct</strong></p>

<!-- Variantă A/B recomandată (Growth Hacker): Subiect B: "49 RON — pachetul complet de acte, gata în 60s" -->
```

---

## MODULE 6 — Structura Chestionarului, Scutul Zero-Refund UX & Google Ads

### 6.1 UI Copy Chestionar (ce completează manual vs. ce extrage OCR)

| Pas | Întrebare (copy exact) | Sursă date |
|---|---|---|
| 0 | „Ai la tine: CI (față + verso), CIV (față + verso), talon?” | — (checkbox-uri de confirmare) |
| 1 | „Încarcă pozele: CI vânzător (față, verso), CI cumpărător (față, verso), talon/CIV” | **OCR** (Modulul 2) |
| 2 | „Prețul de vânzare (RON):” | **Manual** (nu apare pe niciun document) |
| 3 | „Data tranzacției:” | **Manual** (cu default = astăzi) |
| 4 | „Orașul unde se încheie contractul:” | **Manual** (dropdown SIRUTA + free-text) |
| 5 | „Mașina are sub 24 de luni de la prima înmatriculare?” | **Manual** (checkbox → scutire taxa de transcriere) |
| 6 | „Câmpurile extrase din acte au fost verificate și corecte?” | **Manual** (checkbox acord — Modulul 6.2, deblochează plata) |

**Regula de aur:** OCR extrage tot ce apare pe documente (nume, CNP, serie, adresă, VIN, plăcuțe, CIV, talon). Clientul completează MANUAL doar ce nu există pe acte (preț, dată, oraș) + bifează acordul.

### 6.2 Ecranul de Pre-vizualizare Date — The "Zero-Refund" Shield (wireframe text)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  AutoAct — Verifică datele înainte de plată                    Pas 4/5  │
├──────────────────────────────────────────────────────────────────────────┤
│  [Vânzător]  [Cumpărător]  [Vehicul]  [Tranzacție]                      │
│  ▲ tab activ                                                             │
├──────────────────────────────────────────────────────────────────────────┤
│  VÂNZĂTOR                                                               │
│  Nume complet      [ Popescu Andrei-Ionut                    ] ✓ OCR     │
│  CNP               [ 1750314411231                          ] ✓ validat  │
│  Serie + nr. CI    [ RX 123456                              ] ✓ OCR     │
│  Adresă            [ Str. Libertății nr. 12, bl. A2, ap. 7   ] ⚠ necert  │
│  Localitate        [ Bucuresti (Sector 1)          ] ⚠ SIRUTA ok         │
├──────────────────────────────────────────────── OCR-neconfiabil: GALBEN ─┤
│  ⚠ 2 câmpuri nesigure (galben = OCR-neîncrezător, click pentru editare inline) │
│  ✓ 3 câmpuri validate matematic (CNP), VIN fără I/O/Q, SIRUTA ok         │
├──────────────────────────────────────────────────────────────────────────┤
│  ☐ Declar pe proprie răspundere că toate datele sunt corecte și         │
│    complete și am verificat CNP-ul, seria CI, VIN-ul și plăcuța.         │
│    Înțeleg că actele se emit exact cu datele de mai sus și că orice      │
│    eroare de date introduse de mine nu poate fi rambursată.              │
│                                                                          │
│  [ █████████████████ PLĂTEȘTE 49 RON █████████████████ ]  ← dezactivat   │
│  Subiect: Stripe 3DS · În 60 s primești ZIP-ul pe e-mail; factura vine de la Stripe. │
└──────────────────────────────────────────────────────────────────────────┘
```

**Mecanica Zero-Refund (obligatorie):**

1. Tab-uri pe grupe de date (Vânzător / Cumpărător / Vehicul / Tranzacție) — nu o listă lungă intimidantă.
2. **Galben = nesigur (OCR low-confidence sau `campuri_nesigure` din Gemini)**: câmpul devine editabil inline (click → input). Clientul nu poate debifa galbenul — doar corectând textul.
3. **Checkbox-ul legal obligatoriu** cu formulare de asumare: fără bifă, butonul „PLĂTEȘTE 49 RON” rămâne `disabled`. Acesta este scutul: clientul assumă responsabilitatea datelor, refuzul rambursării este contractul de asumare. Butonul se activează doar la `acord_client == true && campuri_galbene == 0`.
4. Badge-uri vizuale: ✓ verde (validat matematic), ⚠ galben (de corectat), roșu (blochează plată — ex. CNP invalid: corectează sau anulează).
5. Valoare de business: refuzurile de rambursare scad drastic — clientul vede exact ce cumpără înainte să plătească.

### 6.3 Structura Campaniei Google Ads (Zero-Cost Setup cu vouchere)

**Setup zero-cost:** cont nou Google Ads → activezi contul cu voucher (promotions.google.com sau ofertele din cont — de obicei ~500 RON credit pentru conturi noi RO, condiții: plată inițială mică). Fără vouchere active, oprești campania și aștepți.

**Cuvinte cheie — 15, cu intenție comercială maximă (match type "exact" și "phrase"):**

1. contract vanzare cumparare auto pdf completat
2. contract vanzare cumparare auto model completat 2026
3. acte necesare vanzare auto catre persoana fizica
4. contract vanzare auto notar sau autentificat
5. acte necesare transcriere auto pe numele meu
6. transcriere auto DRPCIV acte necesare 2026
7. contract vanzare cumparare auto persoana fizica pdf
8. acte auto vanzare masina printat
9. model contract vanzare auto completat cu datele mele
10. generare contract vanzare auto online rapid
11. acte transcriere masina in 60 de secunde
12. pachet acte vanzare masina download pdf
13. contract auto DRPCIV completat automat
14. acte vanzare auto online ieftin rapid
15. genereaza contract vanzare masina cu datele din CI

**Structura: 2 Reclame Responsive Search Ads (RSA):**

**RSA A — "Contract V-C Auto completat în 60s":**
- H1: Contract V-C Auto Online
- H2: Completat Automat în 60 Secunde
- H3: Acte DRPCIV Gata de Print
- H4: 49 RON, Fără Abonament
- H5: Generat din Pozele Actelor Tale
- H6: PDF Gata de Notar
- H7: Pachet Complet AutoAct
- D1: Încarci pozele actelor, sistemul completează automat contractul, cererea DRPCIV și declarațiile fiscale. Verifici datele, plătești 49 RON, primești ZIP-ul instant.
- D2: Acte auto complete: contract vânzare-cumpărare + cereri DRPCIV + declarații fiscale. Verificate matematic (CNP, VIN). PDF gata de printat și dus la notar/DRPCIV.

**RSA B — "Transcriere Auto: toate actele, gata de print":**
- H1: Transcriere Auto — Acte Complete
- H2: Cerere DRPCIV + Contract V-C
- H3: Generat Din Scanarea CI + CIV
- H4: Verificare CNP + VIN Automată
- H5: Ecran de Verificare Înainte de Plată
- H6: Livrare Instant pe E-mail
- H7: Preț Fix 49 RON
- D1: Scanezi CI, CIV și talonul. AutoAct completează automat toate actele pentru transcriere. Verifici, plătești 49 RON, descarci ZIP-ul imediat.
- D2: Nu mai copia datele manual în formulare. AutoAct le extrage din acte, le validează (CNP, VIN fără I/O/Q, SIRUTA) și le pune în contractul de vânzare + cererile DRPCIV.

**Configurare campanie (recomandare Growth Hacker):** 1 campanie → 1 grup de anunțuri (cele 15 cuvinte) → ambele RSA-uri active (Google le alternează). Extensii: Sitelinks („Cum funcționează”, „Preț”, „Exemplu PDF”), Callout („Livrare 60 s”, „Verificare matematică CNP”, „Fără abonament”). Locație: România. Limbă: română. Licitație: Manual CPC sau „Maximize clicks” cu plafon CPC 1,5 RON (buget recomandat 20–30 RON/zi doar din vouchere).

---

### 6.4 Implementarea UI — folderul `site/`

Interfața din acest modul este implementată funcțional, 100% statică (HTML/CSS/JS, zero dependențe):

- **Chestionar 5 pași** (§6.1) + **ecranul Zero-Refund** (§6.2): taburi cu buline ⚠/✗, câmpuri galbene editabile inline (prima editare le trece în „verificat"), câmpuri roșii blocante (validare locală CNP/VIN/plăcuță/serie), CNP validat devine read-only, checkbox-ul legal deblochează butonul de plată doar la `acord && galbene == 0 && rosii == 0`.
- `site/validare.js` = aceiași validatori ca nodul n8n; compatibilitatea e garantată de două suite: `node verifica-ui-validare.js` (29/29) și `node module-2/test-cnp-validator.js` (90/90).
- Consumă direct răspunsul nodului „Fallback Client" (`campuri_nesigure`, `cnp_erori`, `scor_calitate`, `mesaj_client`); acceptă și formatul nodului 5 (date la rădăcină).
- **Demo fără server:** `node site/construieste-inline.js` → `site/index.html` (din `index.sablon.html` + prețul din `config.js`) și apoi `site/demo-standalone.html` (single-file, CSS+JS inline — trimiți oricui, merge direct). **Se editează șablonul, nu `index.html`.**
- **Deploy:** GitHub Pages / Netlify Drop / Cloudflare Pages / block Caddy pe serverul Oracle — tabel complet în `site/README.md`; singura editare la deploy: `WEBHOOK_URL` în `site/config.js`.

### 9.1 Banca de cifre — un singur preț în tot proiectul

Prețul (49 RON) era scris în **6 locuri**, dintre care unul singur era real (`site/config.js`). Celelalte erau copii care puteau să rămână în urmă la orice schimbare — și una dintre ele (`"price": "49"` din JSON-LD) e cea pe care Google o indexează, deci o cifră greșit acolo înseamnă preț greșit în SERP.

Cum arată acum:

| Unde | Cum ajunge valoarea |
|---|---|
| `site/config.js` | **sursa reală** |
| `config-autoact.js` | `require('../config-autoact.js')` → valoarea extrasă din config.js; singurul mod prin care codul Node află prețul |
| `site/index.sablon.html` | 5 tokenuri de preț (`{{PRET_RON}}` / `{{PRET_AFISAT}}`): `<html data-pret>`, meta description, hero, butonul de plată, JSON-LD |
| `site/index.html` | **generat** de `construieste-inline.js` (devenit artefact, verificat la pasul 11) |
| `site/demo-standalone.html` | generat din `index.html` |
| `module-5/build-workflow-plati.js` | condiția `IF suma === PRET_RON && moneda === RON` vine din `config-autoact.js`; ID-urile Stripe vin din `site/config.js` |
| `site/app.js` | runtime, din `AUTOACT_CONFIG.PRET_RON` (fallback-ul citește tot din HTML-ul generat) |

**Guard-ul de conținut** (`site/test-banca-cifre.js`, pasul 10 din runner → rulează și în CI) citește doar *textul public* — meta description, titlu, text vizibil, obiectul JSON-LD — și CADE dacă o cifră nu vine din cod și nu e excepție declarată:

- **excepții cu motiv**: `9500` (placeholder de exemplu în câmpul prețului), `24` (prag legal scutire taxă), `60` (promisiunea „în 60 de secunde”);
- **structurale** (nu se mai declară): numerotare de pași (1–9) și ani (1900–2100);
- orice cifră legitimă nouă se **declară în `EXCEPTII` cu motiv**, nu se scrie direct în HTML.

Testul se autoverifică prin 7 mutații (39 în buton, 39 în JSON-LD, 59 în meta, 129 nou, 90 de secunde, 12 pași, 12 luni) — fiecare trebuie să facă guard-ul să cadă, altfel testul pică el însuși.

### 9.2 CI — `ruleaza-teste.sh` + GitHub Actions

Un singur runner (`bash ruleaza-teste.sh`, ~100 s, zero dependențe npm) rulează **toate** suitele, în ordinea dependențelor:

1. Sintaxă — 20 fișiere JS + scriptul de deploy (node --check / bash -n);
2. Scheme JSON — profil de tranzacție + harta placeholder-e;
3. Test Data Kit — regenerat + reverificat;
4. **Suita CNP — 90 verificări** (n8n + UI, output identic obligatoriu);
5. **UI ↔ n8n — 29 verificări**;
6. Profil demo — 6 verificări end-to-end;
7. **Șabloane — 57 verificări** (tokeni, căi, harta nodului „Documente ZIP");
8. **Builder-e workflow** — pipeline (15) + plăți (23) + site (`index.html` din șablon + demo standalone);
9. **Pipeline END-TO-END — 35 verificări pe 4 scenarii** (`test-pipeline-e2e.js`): execută workflow-ul REAL nod cu nod — codurile Code (Decodare, Validator, Documente ZIP), expresiile IF și responseBody evaluate generic, jsonBody-urile reale — cu OCR fake (text DEGRADAT din Test Data Kit: VIN cu „0→O", plăcuță minusculă fără liniuțe, nume în caps) și Gemini fake (aplică regulile din promptul real: O→0, normalizare plăcuță, case-fix). Scenarii: fericit (degradat→curățat→scor 100→plată→37 placeholder-e→Gmail), CNP corupt→fallback, 2 câmpuri nesigure→fallback, webhook incomplet→eroare. Testul a prins și reparat un bug real: expresia jsonBody Gemini era sintaxă JS invalidă (escaping prin heredoc) — builder-ul o compune acum programatic;
10. **E2E cu PostgreSQL REAL — 27 verificări** (`module-5/test-e2e-idempotency.js`): pornește `postgres:16-alpine` efemer (fără porturi publicate), aplică **fișierele reale** `module-4/gdpr-purge.sql` apoi `module-5/plati-schema.sql`, apoi execută **query-ul de idempotency extras direct din `autoact-workflow-plati.json`** (placeholder-uri înlocuite): prima plată → `duplicat=0`, repetată → `duplicat=1`, 10 re-rulări → mereu exact 1 rând, 12 apeluri → 1 singur rând în DB (zero facturi duplicate), tranzacții diferite nu se blochează reciproc, iar status diferit pe același `order_id` **nu suprascrie** istoricul. **Scenariul 6** rulează job-ul GDPR pe date reale și verifică EFECTUL, nu sintaxa: PII epurată + `stare=epirat_gdpr` + suma păstrată, pragul 48h respectat, fișierele șterse, log de audit cu numere reale, al doilea rulaj nu epurează nimic. Prețul vine din `config-autoact.js`, deci testul rămâne sincronizat cu workflow-ul la orice schimbare de preț;
11. **Banca de cifre + NAP + documente + pagini legale — 149 verificări** (`site/test-banca-cifre.js`): textul public nu conține nicio cifră fără origine în cod, JSON-LD / meta / buton coincid cu `config.js`. **Pagini legale** (`/termeni`, `/gdpr`): NAP-ul vine din token și niciun identificator nu e scris cu mâna într-un șablon, ambele praguri GDPR apar în pagină ȘI în `module-4/gdpr-purge.sql`, iar lista de operatori subcontractori e verificată **în două sensuri** — fiecare furnizor declarat e apelat efectiv de workflow, și fiecare domeniu extern apelat e declarat în pagină (altfel adaugi un furnizor și uiți să-l anunți pe cei care au dat date). Celălalt sens e cel care contează pentru GDPR: o listă corectă *la scriere* nu ajută nimic dacă nu se strică singură la schimbare. Plus **7 mutații** (`site/test-mutatie-pagini-legale.js`): furnizor declarat și nefolosit, prag schimbat în SQL, NAP copiat cu mâna, blocajul de deploy eliminat, marcajul de necompletat scos din pagină. Trei dintre ele au prins găuri reale ale primei versiuni a verificărilor;
12. **Identitate Facebook — 163 verificări + 7 mutații** (`brand/test-copy-facebook.js` + `brand/test-mutatie-facebook.js`): materialele de pe pagină și din grup nu pot spune ce codul nu sprijină. Orice „NN lei" trebuie să fie `PRET_RON` din `site/config.js`, orice „NN documente" să fie numărul real de șabloane din `module-2/sabloane/`, promisiunile nesemnate (extindere geografică, „rezultat garantat") sunt blocate cu motivul fiecăreia, NAP-ul placeholder nu poate ajunge în textul de lipit, iar un PNG mai vechi decât sursa lui HTML este respins — fiindcă pe pagină se urcă PNG-ul, nu HTML-ul, iar textul corectat rămâne altfel invizibil. Cele 7 mutații sunt regresii reale; două au prins găuri ale primei versiuni (preț greșit **în blocul de cod de lipit**, și promisiune scrisă **fără diacritice**). Textele de configurare sunt în `brand/facebook/`, toate gata de lipit;
12.bis. **Previzualizarea linkurilor — 37 verificări** (`site/construieste-og.js`): când cineva partajează un link spre `autoact.eu` într-un comentariu de pe pagina de Facebook sau într-un mesaj privat, Facebook **nu** citește `<title>` și `<meta description>` — citește etichetele `og:`, care lipseau cu tot. Fără ele, orice link postat se afișa ca URL gol, fără motiv de clic. Scriptul le adaugă pe toate cele patru pagini și verifică: un singur `og:title` și `og:image` pe pagină (cu două, Facebook alege la întâmplare), `og:url` canonic per pagină, descriere ≤ 200 caractere (Facebook taie fără avertisment), imaginea **la adresa pe care o declară `og:image`** (altfel cardul apare fără imagine, tăcut), plus `sitemap.xml` în care fiecare URL corespunde unei pagini care există efectiv și fiecare pagină publică e fie în sitemap, fie exclusă în mod justificat.
13. Guard-uri: artefactele generate (`autoact-workflow.json`, `autoact-workflow-plati.json`, `site/index.html`, `site/demo-standalone.html`, `brand/png/*.png`) trebuie să fie **la zi cu versiunea comisă** (în repo git) + `docker compose config` valid (dacă Docker există).

`.github/workflows/ci.yml` rulează același script la **fiecare push (toate branch-urile) și pe fiecare PR**, pe `ubuntu-latest` + Node 20, cu doar `actions/checkout@v4` + `actions/setup-node@v4`. În CI pașii 9 se activează complet (checkout creează repo-ul; Docker e preinstalat pe runner). Regula: ce trece local trece identic în CI.

**✅ Final de blueprint. Toate scripturile menționate există pe disc și au fost testate (CNP: 5/5 valide + 90/90 în suita de regresie; ZIP: validat `unzip -t`; schema JSON: parsată OK; workflow n8n: 15/15 auto-validări; plăți: 23/23; UI: flux demo verificat interactiv; banca de cifre: 71/71 (cifre + NAP + LAUNCH.md); PG real: 27/27 (idempotency + GDPR pe docker, rulat efectiv); CI: suita completă rulată local — pașii 1–11 PASS; pasul 12 (guard artefacte) cerut commitarea artefactelor regenerate: site/index.html, site/contact.html). Deciziile finale (regiunea OCI, providerul de plăți, contabilul pentru TVA) aparțin Fondatorului.**
