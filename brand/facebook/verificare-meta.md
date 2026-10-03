# Verificarea identității pe Meta — cu ce te duci acolo

> **(3 oct. 2026)** · pregătire pentru pasul în care vii cu **actul de
> identitate** și **cardul**. Scopul: să nu pierzi 20 de minute uitând unde
> trebuie pozat un document.
>
> **Ce nu pot face eu, și de ce contează:** Meta își schimbă formularul de
> verificare fără notificare și cere, la unele variante, documente diferite.
> De aceea textul de mai jos e o **listă de pregătire**, nu o descriere a
> formularului: verifică pe loc ce ți se cere și urmează ce apare.

---

## 1. Ce pregătești înainte să deschizi pagina

| Document | Stare | Observație |
|---|---|---|
| **Act de identitate** (CI sau pașaport) | ☐ | poză clară, toate colțurile vizibile, fără reflex |
| **Cardul** | ☐ | cel prin care poți fi debitat, pe numele titularului |
| **Domiciliul** — adresa unde locuiești | ☐ | **nu** neapărat adresa firmei |
| **Datele firmei** — denumire, CUI/CIF, Registrul Comerțului | ☐ | din `site/config.js` → `NAP` |
| **Domeniul** — `autoact.eu` | ☐ | Meta cere dovezi că deții domeniul: conținut pe site + DNS |
| **Telefon** | ☐ | cel din `NAP.TELEFON` |

**Adresa de domiciliu e cea care te poate opri**, nu adresa firmei. Formularul
o cere separat, iar majoritatea o verifică prin documente care nu au firma în
titlu (factură de utilități, extras de cont). Completeaz-o cu adresa unde
locuiești efectiv, nu cu cea de la sediu — și tiază adăugată din alt stat ar
fi motiv de respingere.

## 2. Ordinea pașilor

1. **Meta Business Suite** → creează Business Portfolio (cont distinct de
   pagina).
2. **Setări afaceri** → **Centrul de securitate / verificare de afacere**.
3. Completează: denumirea legală, adresa, domeniul, categoria.
4. Încarcă actul de identitate în formatul cerut.
5. Completează **cardul**, ca metodă de plată, **chiar dacă nu pornim
   reclame**.
6. Salvează și **notează data**. Verificarea nu e instantă.

## 3. De ce completăm cardul dacă nu facem reclame

Decizia de azi: **fără reclame, fără boost, buget zero.** Cardul se
completează oricum, pentru că:

- Meta cere metoda de plată la momentul verificării, în majoritatea
  fluxurilor — nu e o alegere, e o condiție de trecere;
- cardul e necesar și mai târziu, pentru orice plată în cont;
- e un pas de 2 minute făcut acum, în loc de o blocare peste o lună.

**Ce nu facem cu cardul:** nu setăm buget zilnic, nu activăm reclame
accelerate, nu lăsăm nimic pornit care să cheltuiască. Dacă în cont rămâne o
reclamă activă, se **oprește imediat** — o reclamă activă trimite oameni spre
un flux de plată care încă nu e pe contul live.

## 4. Ce se întâmplă cu pagina până e verificată

- Pagina se poate crea și configura **înainte** de verificare. Nu bloca
  configurația în așteptare.
- Limitările tipice până la verificare: reclame și boost **blocate**,
  WhatsApp Business și unele funcții de inbox **limitate**.
- **Postările organice nu sunt blocate** — de aceea calendarul din
  [`calendar-2-saptamani.md`](calendar-2-saptamani.md) nu așteaptă nimic.

## 5. Dacă cer său refuză verificarea

1. **Nu rescrie nimic în grabă.** Cel mai des motivul e un document ilizibil
   sau o adresă care nu se potriviște cu documentul.
2. Notează exact motivul afișat — e singurul lucru util de urmărit la retry.
3. Refac pozele actului: fără reflex, fără umbră, toate colțurile în cadru.
4. Folosește adresa de domiciliu, verificată cu documentul cu care o dovedești.
5. Reîncearcă **o singură dată**, la câteva zile distanță. Retry-urile
   imediate succesive par suspicioase și pot înrăutăți situația.

## 6. Tot ce faci acolo, **notează aici**

| Pas | Ce ai bifat | Data |
|---|---|---|
| Business Portfolio creat | ☐ | |
| Categoria afacerilor aleasă | ☐ | |
| Verificarea trimisă | ☐ | |
| Starea după trimitere | ☐ | |

Fără această tabelă, într-o lună nu mai știi dacă ai trecut sau doar ai
crezut că ai trecut. E exact greșeala pe care ClarTransfer a documentat-o
pentru statisticile paginii: „nu am acces, deci nu pot spune".

## 7. Legătura cu restul proiectului

Verificarea Meta **nu blochează** nimic din [`LAUNCH.md`](../../LAUNCH.md).
Cele două blocaje rămân:

- **NAP-ul placeholder** din `site/config.js` — blochează deploy-ul și
  blochează orice publicare pe Facebook cu datele de contact.
- **Contul Stripe live** — cerut pentru ca butonul „Cumpără acum" să ducă
  undeva real, nu în sandbox.

Meta și Stripe se rezolvă **în paralel**, nu în ordine. De aceea niciunul
dintre ele nu e în calea celuilalt.