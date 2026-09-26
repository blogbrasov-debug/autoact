# AutoAct — Șabloane Google Docs (Modulul 2.7)

Conținutul celor 3 documente din pachetul de 49 RON, cu placeholder-e
machine-readable înlocuite automat de nodul **Documente ZIP** din
`module-2/autoact-workflow.json`.

| Fișier | Document final | Tokeni |
|---|---|---|
| `contract-vanzare-cumparare-auto.md` | Contract V-C auto (2 exemplare) | 32 |
| `cerere-drpciv.md` | Cerere de transcriere DRPCIV | 31 |
| `declaratie-fiscala.md` | Declarație fiscală vânzare/cumpărare | 40 |
| `placeholders.json` | Harta canonică `{{placeholder}}` → cale în Profilul de Tranzacție | 37 unici |

⚠️ **Avertisment legal:** conținutul este un punct de plecare redactat automat.
Înainte de producție, validează-l cu un notar/avocat și adaptează-l la
formularele oficiale în vigoare ale DRPCIV/ANAF. Decizia finală aparține
Fondatorului (Human-in-the-Loop).

## Setup Google Docs (gratuit, o singură dată)

1. **Copiază conținutul** fiecărui fișier `.md` într-un Google Doc nou
   (formatarea Markdown se pastrează prin inserție; verifică boldurile și tabelele).
2. **Păstrează placeholder-ele textuale exact** (`{{vanzator_nume}}` etc.) —
   nelucrăm cu „Build document templates", ci cu înlocuire textuală programatică.
3. Notează **ID-urile documentelor** (din URL):
   `https://docs.google.com/document/d/<DOCUMENT_ID>/edit`
4. În n8n, creează **credentials Google Drive OAuth2** (același cont Google);
   nodurile de mai jos folosesc Google Docs API + Drive API, ambele gratuite.

## Fluxul de generare (per tranzacție)

```
[Documente ZIP]            → produce { valori: {placeholder → valoare}, ... }
[HTTP: Docs batchUpdate]   → POST https://docs.googleapis.com/v1/documents/{DOC_ID}:batchUpdate
                             body: requests: [ { replaceAllText: { containsText: { text: "{{ph}}", matchCase: true }, replaceText: "<valoare>" } } × 37 ]
[HTTP: Drive export PDF]   → GET https://www.googleapis.com/drive/v3/files/{DOC_ID}/export?mimeType=application/pdf
[Code: zip-store]          → arhivă ZIP (module-2/zip-store.code-node.js)
[Gmail Livrare]            → ZIP atașat + factura (Modulul 5.2)
```

Ordinea batchUpdate → export: **așteaptă răspunsul complet** al batchUpdate
înainte de export (nodul HTTP n8n face asta implicit în lanț).

## Verificare automată

```bash
node module-2/verifica-sabloane.js   # 55 verificări: tokeni ⊆ hartă,
                                     # căi rezolvabile pe profil demo,
                                     # zero placeholder-e necompletate
node module-2/build-workflow.js      # regenerează workflow-ul cu harta din nodul 10 (15 verificări)
```

Orice editare a șabloanelor trebuie urmată de rerularea ambelor scripte —
ele resping tokeni neincluși în hartă sau valori care nu se rezolvă pe
Profilul de Tranzacție (module-1/profil-tranzactie.schema.json).

## Reguli pentru placeholder-e

- Format: `{{litere_mici_cu_underscore}}` — regex-ul validatorului: `\{\{[a-z_0-9]+\}\}`.
- `matchCase: true` în batchUpdate, ca să nu atingi eventualii `{{...}}` decorativi.
- Nu introduce placeholder-e noi fără a le adăuga în `placeholders.json`
  și a le mapa la o cale validă din schema.
