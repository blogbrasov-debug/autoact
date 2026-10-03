# AutoAct — Plan de lansare (LAUNCH.md)

> Documentul care spune **în ce ordine** se pornește AutoAct și **ce blochează** fiecare pas.
> Tot ce e în cod e testat automat (`bash ruleaza-teste.sh` — 13 pași, verde în CI).
> Ce **nu** poate fi testat de cod e listat aici ca blocaj: conturi, secrete, decizii legale.

**Promisiune de produs:** pachet acte transcriere auto în 60 s · 49 RON · cost operațional **0 RON**.
**Stivă:** n8n + PostgreSQL + Caddy pe Oracle Cloud Free Tier · site static în `site/`.

---

## 0. Situația la data documentului

| Componentă | Stare |
|---|---|
| 6 module + BLUEPRINT | ✅ livrate, testate |
| Workflow pipeline (14 noduri) + plăți (24 noduri) | ✅ generatoare cu auto-validări, JSON importabil |
| Șabloane Google Docs (3 documente, 37 placeholder-e) | ✅ conținut redactat pe disc |
| Site static + pagină de contact | ✅ generate din `site/*.sablon.html` |
| Idempotency + GDPR contra PostgreSQL real | ✅ 27/27 pe Docker |
| NAP (CIF, adresă, telefon) | ⚠️ **PLACEHOLDER** — blochează deploy-ul |
| Pagini `/termeni` și `/gdpr` | ❌ **nu există** — linkuri moarte în footer |
| Conturi externe (Netopia, SmartBill, OpenAI, Gemini, Google) | ❌ de creat |
| Git remote + push | ❌ făcut un singur commit local, nimic încă nepublicat |

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

| Serviciu | Ce obținem | Unde intră |
|---|---|---|
| Oracle Cloud | VM A1 Always Free (**2 OCPU / 12 GB** — limita redusă de Oracle pe 15 iunie 2026) | — |
| Netopia (MobilPay) | cont merchant + cheie RSA + `orderId` callback | n8n Credentials + `.env` |
| SmartBill | API user + token + serie factură | n8n Credentials + `.env` |
| OpenAI | cheie API (Vision OCR) | n8n Credentials |
| Google AI Studio | cheie Gemini | n8n Credentials |
| Google (Docs + Gmail) | cont, OAuth2, 3 șabloane create din `module-2/sabloane/` | n8n Credentials + `.env` |
| Cloudflare/ClouDNS | `autoact.ro` → IP-ul VM-ului | DNS |

⚠️ **Contul Google** e singurul careCer **creare manuală a celor 3 șabloane** — instrucțiunile sunt
în `module-2/sabloane/README.md`. Fără ele, nodul „Placeholder-e Docs" nu are ce înlocui.

### Pasul 3 — Infrastructura

```bash
cd module-3
./deploy-autoact.sh ubuntu@IP_PUBLIC_AUTOACT autoact.ro
```

Scriptul: copiază compose + Caddyfile, generează `.env` cu secrete **aleatorii** pe server,
configurează firewall-ul (80/443), instalează Docker, pornește stack-ul.
**Blocaje:** regiunea OCI se alege o singură dată; A1 e frecvent „out of capacity" (reia, nu
înlocui cu `E2.1.Micro`). **Backup obligatoriu:** `.env` (fără `N8N_ENCRYPTION_KEY` pierzi
credential-urile).

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
3. Upload pe hosting static (GitHub Pages / Netlify Drop / Cloudflare Pages / block Caddy).

### Pasul 7 — Smoke test (înainte de GO, obligatoriu)

- **Plată reală de 49 RON**, de la zero: introdu pozele, verifică datele, plătește, primește ZIP.
- Verifică manual: contractul are datele corecte, factura are **CIF-ul din NAP**, VIN-ul e valid,
  și **nu s-a generat factură duplicată** la retransmitere (retrigger-ează webhook-ul Netopia).
- Verifică job-ul GDPR: după 48h de la livrare, datele sunt epurate.
- Verifică `curl -I https://autoact.ro` → TLS valid, redirect 80→443.

---

## 2. Conținut legal — **nu se poate genera din cod**

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
instantei și pe un job săptămânal care face un `curl` pe `autoact.ro` (deci
n8n execută ceva și contul nu e „idle"). Un ping real de săptămânal e suficient.

**b) Limita Always Free s-a înjumătățit.** Pe **15 iunie 2026**, Oracle a redus
contingentul Ampere A1 de la 4 OCPU / 24 GB la **2 OCPU / 12 GB**, fără anunț
public. Pe cont Free-only, o instanță 4/24 este **oprită automat**; pe cont PAYG,
depășirea generează **factură reală**. Documentația cerea încă 4/24 — deci nimic
nu s-ar fi plătit, dar serverul ar fi murit după prima întreținere.
`verifica-cost-0.js` (pasul 12 din runner) verifică limita la fiecare rulare.

**c) „Cost fix 0 RON" ≠ „cost total 0 RON".** Costurile care cresc cu volumul:
OpenAI Vision OCR ≈ 0,13 RON/comandă (5 imagini), comision Netopia per
tranzacție, cotă SmartBill per document. La 49 RON/comandă marja rămâne
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

## 3. Blocaje critice — rezumat

| # | Blocaj | Cine decide | Când blochează |
|---|---|---|---|
| 1 | NAP placeholder (`RO00000000`) | Fondator | **deploy-ul se oprește** |
| 2 | Pagini `/termeni` + `/gdpr` lipsă | Fondator + juridic | lansare publică |
| 3 | Conturi Netopia/SmartBill/Google | Fondator | pașii 2, 6, 7 |
| 4 | 3 șabloane Google Docs create | Fondator | pasul 6 |
| 5 | Regim TVA confirmat | Contabil | prima factură |
| 6 | DNS `autoact.ro` → VM | Fondator | pasul 3 (Caddy emite TLS doar cu DNS valid) |
| 7 | `.env` de pe server salvat local | Fondator | **pierderea credential-urilor n8n** |
| 8 | Git remote + push | Fondator | CI, istoric, backup |
| 9 | Reclaim pe cont inactiv | Fondator | continuitate (vezi §2.bis) |

---

## 4. Rollback

| Situație | Ce faci |
|---|---|
| Workflow n8n stricat | Importă din nou fișierul `.json` din repo |
| Cod n8n stricat | `sudo docker compose exec n8n n8n import:workflow --separate --input=backup.json` |
| Secret pierdut | **irecuperabil** — creează alt cont n8n și reatribuie credential-urile |
| Factură duplicată | `plati_procesate` are `order_id` unic; interogă `SELECT * FROM plati_procesate ORDER BY procesat_la DESC` |
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
- [ ] `bash ruleaza-teste.sh` verde (13/13 pași)
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