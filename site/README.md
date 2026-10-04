# AutoAct — Site static (chestionar + ecran Zero-Refund)

Pagină 100% statică (HTML/CSS/JS, zero dependențe, un singur build de 1 secundă). Gata de hosting gratuit.

## Deploy pe hosting gratuit

Orice hosting static funcționează — urci conținutul folderului `site/`:

| Provider | Pași | Domeniu |
|---|---|---|
| **Cloudflare Pages** (recomandat) | cont gratuit → Workers & Pages → Create → Pages → Git → repo-ul → build: `bash -c "mkdir -p dist && cp site/*.html site/*.js site/styles.css dist/ && rm -f dist/*.sablon.html dist/test-*.js dist/construieste-inline.js"` → output `dist` | `https://autoact.eu` (domeniu propriu, TLS inclus) |
| **Netlify Drop** | netlify.com/drop → tragi folderul `site/` | `https://nume.netlify.app` |
| **Oracle A1** (stack-ul Modulul 3) | Adaugă un site block în Caddyfile servind `/var/www/autoact` | `https://autoact.eu` |

⚠️ **GitHub Pages e exclus**: [limits of GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
interzice explicit „free web-hosting service to run your online business, e-commerce site" —
AutoAct vinde, deci planul gratuit nu se aplică. Vercel Hobby are aceeași restricție
(necomercial). Cloudflare Pages și Netlify Free permit uz comercial pe plan gratuit.

După deploy: editezi `config.js` și pui `WEBHOOK_URL` = Production URL-ul real al nodului Webhook UI (`https://autoact.eu/webhook/test-ui`). Lăsat gol, site-ul rulează în **mod demo**, fără backend.

⚠️ **Un singur domeniu, tot pe VM.** Caddy servește site-ul, webhook-urile și interfața n8n pe același domeniu (cel dat la deploy: `deploy-autoact.sh <user@host> autoact.eu`). De aceea `autoact.eu` trebuie să indice spre VM, nu spre Cloudflare Pages: dacă domeniul ar merge la Pages, Caddy nu ar primi niciodată trafic, iar webhook-urile Stripe și formularul de plată ar răspunde 404 — fără nicio eroare vizibilă în Stripe.

## Prețul: o singură cifră în tot proiectul (banca de cifre)

Prețul trăia în 6 locuri, dintre care unul singur era real. Acum:

| Unde | Cum ajunge valoarea |
|---|---|
| `config.js` | **sursa reală** — singurul loc unde se schimbă prețul |
| `index.sablon.html` | tokenul `{{PRET_RON}}` (5 apariții: `<html data-pret>`, meta, hero, buton, JSON-LD) |
| `index.html` | **generat** din șablon de `construieste-inline.js` |
| `demo-standalone.html` | generat din `index.html` (CSS+JS inline) |
| `module-5/build-workflow-plati.js` | `require('../config-autoact.js')` → prețul în payload-ul SmartBill și în condiția `IF suma === PRET` |
| `app.js` | citește `AUTOACT_CONFIG.PRET_RON` la runtime (singurul loc unde mai există o valoare: fallback-ul vine din `<html data-pret>`, tot generat) |

Workflow: **editai `index.sablon.html` (nu `index.html`)** și rulezi

```bash
node site/construieste-inline.js   # scrie index.html + demo-standalone.html
node site/test-banca-cifre.js     # guard: nicio cifră fără origine în cod
```

`test-banca-cifre.js` (pasul 10 din `ruleaza-teste.sh`, deci și în CI) citește textul public
— meta description, titlu, text vizibil, JSON-LD — și CADE dacă apare o cifră care nu vine
din cod și nu este excepție declarată (9500 = placeholder exemplu, 24 = prag legal scutire
taxă, 60 = promisiunea de timp; plus numerotare de pași și ani, tratate ca structurale).
NAP-ul (CIF, telefon, e-mail, adresă) e verificat prin **egalitate strictă** cu `config.js`, nu prin „număr permis” — așa, o cifră modificată în JSON-LD sau în footer e prinsă chiar dacă cifra nouă ar fi altfel legitimă. `config-autoact.js` validează și cifra de control a CIF-ului (cheia canonică `753217532`), deci un CIF greșit e respins înainte de deploy.

Testul se autoverifică prin 7 mutații de cifră și 5 de NAP: dacă cineva scrie „PLĂTEȘTE 39 RON”, `"price": "39"` sau un CIF străin în pagină, guard-ul pică și arată exact problema. Total: **56 de verificări**.

## Fluxul implementat

1. **Chestionar 5 pași** (Modulul 6.1): confirmare documente → upload cele 5 poze → preț → dată/oraș/scutire → „Verifică datele".
2. **Trimitere**: `multipart/form-data` spre webhook-ul n8n (câmpurile `ci_fata`, `ci_verso`, `civ_fata`, `civ_verso`, `talon` + `pret`, `data`, `oras`, `scutire`) — exact ce așteaptă nodul 2 („Decodare fisiere") al workflow-ului.
3. **Ecranul Zero-Refund** (Modulul 6.2): consumă răspunsul nodului „Fallback Client" (`campuri_nesigure`, `cnp_erori`, datele, `scor_calitate`, `mesaj_client`):
   - taburi Vânzător / Cumpărător / Vehicul / Tranzacție, cu buline ⚠/✗ pe taburi;
   - **galben** = `campuri_nesigure` din Gemini — editabil inline; prima editare îl trece în „verificat";
   - **roșu** = validare locală picată (CNP/VIN/plăcuță/serie CI) — blochează plata;
   - rezumat live + scor; CNP validat devine disabled (nu se poate strica);
   - **checkbox-ul legal** → butonul „PLĂTEȘTE 49 RON" (prețul vine din `config.js`) se activează doar când `acord && galbene === 0 && rosii === 0`;
   - plată → POST JSON spre `webhook/plata` (schema din Modulul 5.1) → redirect `url_plata`.

## Fișiere

| Fișier | Rol |
|---|---|
| `config.js` | `WEBHOOK_URL` + `PRET_RON` + `NAP` (CIF, reg. com., adresă, telefon, e-mail) — singurul de editat la deploy |
| `validare.js` | Validatori partajați UI (identici logic cu nodul n8n) |
| `demo-data.js` | Răspuns demo identic structural cu „Fallback Client" (Test Data Kit) |
| `index.sablon.html` / `contact.sablon.html` | **surse de editat** ale paginilor (conțin tokenurile `{{PRET_RON}}`, `{{CIF}}`…) |
| `index.html` / `contact.html` | **GENERATE** din șabloane — nu edita direct |
| `../config-autoact.js` | Cititorul UNIC al `config.js` pentru Node: preț + NAP, cu validarea cifrei de control a CIF-ului |
| `construieste-inline.js` | Build: șablon + config.js → `index.html` → `demo-standalone.html` |
| `test-banca-cifre.js` | Guard: nicio cifră în textul public fără origine în cod |
| `styles.css` | Temă completă, fără dependențe, responsive |
| `app.js` | Wizard, fetch webhook, randare taburi, validări live, buton plată |

## Notă demo

`config.js` vine cu `WEBHOOK_URL` **gol** → pagina rulează în **mod demo** (fără server): butonul „Verifică datele" deschide ecranul Zero-Refund cu datele din `demo-data.js`. Imediat după ce pui URL-ul real în `config.js`, fluxul real se activează automat. Verificarea e pe URL-ul gol, nu pe un domeniu anume — nu se strică la schimbarea domeniului.

Compatibilitatea validatorilor UI ↔ nodul n8n e testată de `node verifica-ui-validare.js` (rădăcina proiectului).

**Important la deploy:** `index.html` și `demo-standalone.html` sunt artefacte generate. Dacă le editezi manual, `bash ruleaza-teste.sh` (pasul 11) pică cu „NU este la zi”. Editează `index.sablon.html` și rulează builder-ul.
