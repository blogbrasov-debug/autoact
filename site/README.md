# AutoAct — Site static (chestionar + ecran Zero-Refund)

Pagină 100% statică (HTML/CSS/JS, zero dependențe, zero build). Gata de hosting gratuit.

## Deploy pe hosting gratuit

Orice hosting static funcționează — urci conținutul folderului `site/`:

| Provider | Pași | Domeniu |
|---|---|---|
| **GitHub Pages** (recomandat) | Push la repo → Settings → Pages → Branch `main` / folder `/site` (sau repo dedicat `autoact-site`) | `https://user.github.io/autoact-site/` |
| **Netlify Drop** | netlify.com/drop → tragi folderul `site/` | `https://nume.netlify.app` |
| **Cloudflare Pages** | Dashboard → Pages → Upload assets → folder `site/` | `https://autoact.pages.dev` |
| **Oracle A1** (stack-ul Modulul 3) | Adaugă un site block în Caddyfile servind `/var/www/autoact` | `https://autoact.ro` |

După deploy: editezi `config.js` și pui `WEBHOOK_URL` = Production URL-ul real al nodului Webhook UI (`https://domeniul.ro/webhook/test-ui`).

## Fluxul implementat

1. **Chestionar 5 pași** (Modulul 6.1): confirmare documente → upload cele 5 poze → preț → dată/oraș/scutire → „Verifică datele".
2. **Trimitere**: `multipart/form-data` spre webhook-ul n8n (câmpurile `ci_fata`, `ci_verso`, `civ_fata`, `civ_verso`, `talon` + `pret`, `data`, `oras`, `scutire`) — exact ce așteaptă nodul 2 („Decodare fisiere") al workflow-ului.
3. **Ecranul Zero-Refund** (Modulul 6.2): consumă răspunsul nodului „Fallback Client" (`campuri_nesigure`, `cnp_erori`, datele, `scor_calitate`, `mesaj_client`):
   - taburi Vânzător / Cumpărător / Vehicul / Tranzacție, cu buline ⚠/✗ pe taburi;
   - **galben** = `campuri_nesigure` din Gemini — editabil inline; prima editare îl trece în „verificat";
   - **roșu** = validare locală picată (CNP/VIN/plăcuță/serie CI) — blochează plata;
   - rezumat live + scor; CNP validat devine disabled (nu se poate strica);
   - **checkbox-ul legal** → butonul „PLĂTEȘTE 49 RON" se activează doar când `acord && galbene === 0 && rosii === 0`;
   - plată → POST JSON spre `webhook/plata` (schema din Modulul 5.1) → redirect `url_plata`.

## Fișiere

| Fișier | Rol |
|---|---|
| `config.js` | `WEBHOOK_URL` + `PRET_RON` — singurul de editat la deploy |
| `validare.js` | Validatori partajați UI (identici logic cu nodul n8n) |
| `demo-data.js` | Răspuns demo identic structural cu „Fallback Client" (Test Data Kit) |
| `index.html` | Chestionar + ecran Zero-Refund (5 upload-uri, taburi, acord) |
| `styles.css` | Temă completă, fără dependențe, responsive |
| `app.js` | Wizard, fetch webhook, randare taburi, validări live, buton plată |

## Notă demo

`config.js` vine cu `WEBHOOK_URL` setat pe domeniul placeholder → pagina rulează în **mod demo** (fără server): butonul „Verifică datele" deschide ecranul Zero-Refund cu datele din `demo-data.js`. Imedi după ce pui URL-ul real în `config.js`, fluxul real se activează automat.

Compatibilitatea validatorilor UI ↔ nodul n8n e testată de `node verifica-ui-validare.js` (rădăcina proiectului).
