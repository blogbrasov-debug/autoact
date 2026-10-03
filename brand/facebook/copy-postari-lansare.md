# Textele postărilor — lansarea paginii AutoAct

> **(3 oct. 2026)** · texte **gata de publicat**, fără editări la loc.
> Numerele vin din cod: 3 documente, 49 lei cu TVA inclus. Dacă vrei să le
> schimbi, schimbă-le în [`site/config.js`](../../site/config.js) **și** în
> fișierele de aici — suita de teste cade dacă textul nu mai corespunde
> codului (`node brand/test-copy-facebook.js`).

---

## 1. Prima postare — de lansare

```
Vind sau cumperi o mașină între persoane fizice în România?

Ți se cere:
· contractul de vânzare-cumpărare
· cererea de înregistrare la DRPCIV
· declarația fiscală

Și de obicei se întâmplă așa: alegi un model de pe internet, îl
completezi pe jumătate, ajungi la o literă unde nu mai știi ce vine,
și pierzi o dimineață.

Am construit AutoAct ca să dispară partea plictisitoare.

📸 Faci pozele actelor
🤖 Noi citim datele și ți le arătăm înainte să plătești
   (corectezi tu ce e greșit — nu primești nimic din greșeală)
💳 Plătești online, cu cardul
📧 Primești cele 3 documente pe e-mail, gata de semnat

49 lei, TVA inclus. Un preț, fără abonament, fără costuri ascunse.

Factura o emite Stripe, cu TVA, și o primești automat.

👉 https://autoact.eu

Întrebări? Scrie în comentarii, răspundem.
```

## 2. Postarea „durează 60 de secunde"

*(alături de `facebook-post-durata.png`)*

```
Cât durează, concret?

Nu „peste noapte", nu „în 24 de ore".

Cuiezi actele în telefon: 2 minute.
Noi le citim, tu verifici datele înainte să plătești: 1 minut.
Plătești cu cardul: 30 de secunde.
Documentele sunt pe e-mail: imediat.

Restul e doar să semnezi unde trebuie și să mergi la ghișeu.
```

## 3. Postarea despre proces

*(alături de `facebook-post-proces.png`)*

```
Cum arată un dosar, pas cu pas

1. Acte — CI sau pașaport, certificat de înmatriculare (CIV) și talon
2. Noi citim datele cu OCR + verificare
3. **Tu verifici tot pe ecran, înainte de plată**
4. Plătești 49 lei (TVA inclus)
5. Primești pe e-mail: contract, cerere DRPCIV, declarație fiscală

Pasul 3 e cel mai important. Nu genereăm nimic din date citite cu
ghicliul — dacă ceva nu se lăsește de citit, îți arătăm problema în
loc s-o trecem peste și să-ți dăm un document greșit.
```

## 4. Postarea de întrebare

*(alături de `facebook-post-intrebare.png`)*

```
Cum se face când nu îl cunoști pe cumpărător?

Ne întreabă mulți. Se întâmplă: mașina e moștenită, vând un autoturism
al unui prieten, cumpărătorul e o rudă în străinătate.

În cererea DRPCIV trebuie completate datele cumpărătorului — și acolo
te-ai blocat, pentru că nu ai ce scrie.

Se poate rezolva, dar NU într-un comentariu public: implică datele
persoanei respective.

Scrie-ne în privat și îți spunem concret ce variante ai.

← răspunde oricare dintre noi în comentarii, cu „trimite-ne mesaj".
```

## 5. Postarea „de ce 49 lei și nu mai puțin"

```
Câteva întrebări pe care le primim des:

„De ce atât? Așa de ieftin nu poate fi bine făcut."

Nu e o trecere prin sat. Un model de document completat și verificat
costă în jur de 49 de lei, și îți dăm exact ce ai nevoie, gata de
semnat.

„Și dacă greșesc ceva?"

Nu poți plăti fără să vezi datele. Înainte de plată apare tot
dosarul, cu tot ce am citit din poze — și bifa explicit că datele
sunt corecte.

Asta e tot garanția: **nimic nu se generează din date pe care nu le-ai
văzut.** Dacă un câmp e neclar, ni-l arăți galben și îl corectăm
înainte să plătești.

„E legal? Nu sună ca o facilitate care ar încălca ceva."

Nu. Exact de aceea nu ne-ai auzit până acum: piața asta e plină de
site-uri care emit documente fără nimeni care să le verifice și fără
niciun control asupra datelor. Noi punem verificarea umană înainte
de plată, nu după.
```

## 6. Recomandările — cum le cerem

**Când:** la 3–5 zile după o livrare reușită, în privat.
**Cum:** mesaj din [`grup-clienti.md`](grup-clienti.md) §6.

Trebuie spus limpede, pentru că e regula de aur aici:

- ❌ **Nu** se cere după o livrare proastă.
- ❌ **Nu** se oferă nimic în schimb (nici discount, nici extensie).
- ❌ **Nu** se cer 5 stele. Se cere părerea, cum a fost.

## 7. Recenzia care chiar ajută

Recenzia pe Facebook e un semnal distinct de Google și complet gratuit.
Pe o pagină nouă, primele 3–5 recenzii cântăresc mai mult decât conținutul
publicat.

Cum arată corect:

```
Am vândut mașina în Brașov. Documentele au venit imediat, am completat
cererea la ghișeu fără nicio eroare. Am văzut toate datele înainte să
plătesc, ceea ce m-a convins.
```

Nu: „Foarte bun, recomand cu încredere!" fără niciun cuvânt despre ce
s-a întâmplat. Recenziile fără conținut nu ajută la nimic și se văd că
sunt cumpărate.

## 8. Ce NU scriem

- ❌ Cifre de încasări, „câștigi X lei", „am X clienți" — n-avem cifre.
- ❌ `Toate orașele din România`, `și în Europa`, `orice țară` — nu livrăm
  încă acolo. O promisiune de extindere nesemnată e exact ce a costat
  pagina ClarTransfer: textele s-au corectat imediat, imaginile au rămas
  săptămâni întregi.
- ❌ `Rezultat garantat` la ghișeu. Nu controlăm ce hotărăște funcționarul.
- ❌ `Zero erori întotdeauna`. Nimeni nu poate garanta asta; poate doar să
  spună ce face verificarea.
- ❌ Comparții cu alte servicii cu numele lor. Nu știm ce fac ele în
  fiecare zi.