# Pagina Facebook „AutoAct · pachet acte auto"

> **(3 oct. 2026)** · tot ce urmează e **text gata de lipit**, în ordinea în care
> îl completezi în Facebook. Nu e nevoie de nicio decizie în timpul configurării.
>
> **Blocaj înainte de a începe:** NAP-ul din [`site/config.js`](../../site/config.js)
> e încă PLACEHOLDER (`RO00000000`, `Str. Exemplu 1`). Dacă apeși „Salvează" cu
> datele de mai jos, publici un număr de fiscal fals. **Completează NAP-ul
> întâi** — se propagă automat și în `.env`, și în contul Stripe.

---

## 1. Crearea paginii

| Câmp | Valoare |
|---|---|
| Tip cont | **Pagină de afaceri** (nu profil personal) |
| Categorie | **Servicii auto** → *Servicii de înscriere / documente auto* |
| Numele paginii | `AutoAct · pachet acte auto` |
| Nume utilizator (handle) | `@autoact` |
| Categorie secundară | *Servicii financiare* — nu: nu vindem produse financiare |

**De ce „pachet acte auto" în nume:** cine caută pe Facebook „acte auto" sau
„documentele vânzării auto" trebuie să ne găsească. Numele e singurul câmp
indexat al paginii.

**De ce nu punem prețul în nume:** prețul se schimbă (deci avem o singură
sursă, `site/config.js`), iar Meta penalizează materialele care induc în
răscumpărare. Prețul stă în bio și în [`grup-clienti.md`](grup-clienti.md).

## 2. Bio (câmp scurt, 255 caractere) — 199 caractere

```
Pachet complet de acte pentru vânzarea mașinii între persoane fizice:
contract, cerere DRPCIV și declarație fiscală. 49 lei, TVA inclus.
Încarci poze, verifici datele, primești documentele pe e-mail.
```

## 3. Descriere (câmp lung)

```
AutoAct pregătește documentele necesare când vinzi sau cumperi o mașină între
persoane fizice, în România.

Primești 3 documente într-un singur pachet: contractul de vânzare-cumpărare,
cererea de înregistrare la DRPCIV și declarația fiscală.

Cum merge:
1. Fotografiazi actele (CI sau pașaport, certificat de înmatriculare, talon).
2. Datele sunt citite automat și ți se arată înainte de plată — corectezi ce
   nu e corect.
3. Plătești online, cu cardul. Factura cu TVA o primești automat de la Stripe.
4. Documentele completate sosesc pe e-mail, gata de semnat și de depus.

Preț: 49 lei, TVA inclus. Un preț, fără abonamente și fără costuri ascunse.

Site: https://autoact.eu
```

## 4. Zona „Detalii" — începe aici, nu lăsa ziaristul să caute

| Câmp | Valoare |
|---|---|
| Adresă | *din* `site/config.js` → `NAP.ADRESA` |
| Telefon | *din* `NAP.TELEFON` |
| E-mail | *din* → `NAP.EMAIL` |
| Oraș | *din* → localitatea din `NAP.ADRESA` |
| Orar | `Răspundem în zilele lucrătoare, 09:00–18:00` |
| Preț | `$$` |
| Site web | `https://autoact.eu` |

## 5. Butoane de acțiune

| Buton | De ce |
|---|---|
| **Trimite mesaj** | singurul canal care nu depinde de telefon |
| **Cumpără acum** | → Payment Link-ul Stripe din `site/config.js` |
| **Site web** | → `https://autoact.eu` |

**Ne ghidăm după claritatea butonului, nu după numărul lui.** Un buton
„Cumpără acum" care ducele într-un Payment Link de sandbox ar trimite clientul
într-un flux mort — deci **adaugă-l abia după ce Stripe e pe contul live**, nu
în sandbox.

## 6. Materialele grafice

Încarcă din `brand/png/`, generate — nu desenate:

| Fișier | Dimensiune | unde se pune |
|---|---|---|
| `facebook-profil.png` | 320×320 | fotografia de profil |
| `facebook-acoperire.png` | 1640×624 | imaginea de acoperire |
| `facebook-post-durata.png` | 1080×1080 | postare „durează 60 de secunde" |
| `facebook-post-proces.png` | 1080×1080 | postare despre proces |
| `facebook-post-intrebare.png` | 1080×1080 | postare de întrebare |

**Regulă:** PNG-urile se randă din sursele HTML cu `node brand/exporta-png.js`.
**Nu edita niciodată un PNG** — textul e HTML, imaginea e ieșire. Dacă schimbi
un cuvânt, schimbă HTML-ul și re-randează, altfel pagina și materialul spun
lucruri diferite.

## 7. Ce NU publicăm și de ce

- **Nu publicăm adresa de e-mail și telefonul placeholder.** Publicarea unui
  număr de fiscal fictiv e o eroare de încredere greu de reparat.
- **Nu promitem `în orice țară`, `toate orașele` sau `rețeaua europeană`.**
  Nu le avem. O promisiune de extindere nesemnată e exact greșeala care a
  costat pagina ClarTransfer: textele s-au corectat în 5 minute, imaginile
  au rămas săptămâni întregi.
- **Nu cerem recenzii cu pârghie.** Recenzia se cere după o livrare bună, fără
  oferit nimic în schimb și niciodată după o livrare proastă.
- **Nu folosim recenzii false sau „prieteni" care dau like.** Meta le
  penalizează, iar penalizarea se aplică contului, nu postării.

## 8. Verificarea identității pe Meta

Când vine cu actul de identitate, urmează
[`verificare-meta.md`](verificare-meta.md) — e checklist-ul pregătit pentru
exact acel pas.

## 9. Ordinea de configurare

1. Completează NAP-ul în `site/config.js` și redeploy.
2. Creează pagina cu numele și categoria de mai sus.
3. Lipește bio-ul, descrierea, Detalii, butoanele.
4. Încarcă cele 5 PNG-uri.
5. **Abia apoi** primește în grupul din [`grup-clienti.md`](grup-clienti.md).
6. Publică prima postare din [`copy-postari-lansare.md`](copy-postari-lansare.md).