// Veghe de fundal: urmareste cand Oracle elibereaza cipuri pentru VM.Standard.A1.Flex.
//
//   node module-6/asteapta-slot.js              -> ruleaza pana gaseste slot sau 12h
//   node module-6/asteapta-slot.js --nelimitat  -> nu se opreste niciodata
//
// Idee: endpoint-ul GET /shapes intoarce lista vida exact cand nu exista capacitate,
// si o lista cu A1.Flex imediat ce se elibereaza. E o interogare de citire, deci nu
// consuma cota de scriere si nu se blocheaza pe rate limiting.
//
// Cand apare slotul, scrie un mesaj tare in log si in fisier, apoi se opreste.

const fs = require('node:fs');
const path = require('node:path');
const { get, config } = require('./oci-client.js');

const TENANCY = config().tenancy;
const IMAGINE_UBUNTU_22_04 =
  'ocid1.image.oc1.eu-stockholm-1.aaaaaaaaxc4wsbihf633lzj7ot6bnbgounsgdqj5opuz5ynbi3xnw2gbpwxq';

const INTERVAL_MIN = 10;
const MAX_ORE = 12;
const SHAPE_CAUTAT = 'VM.Standard.A1.Flex';
const nelimitat = process.argv.includes('--nelimitat');

const LOG = path.join(__dirname, 'slot-rezultat.txt');

function scrie(text) {
  var timp = new Date().toISOString().slice(11, 16);
  var linie = '[' + timp + '] ' + text;
  process.stdout.write(linie + '\n');
  fs.appendFileSync(LOG, linie + '\n');
}

function dorma(ms) {
  return new Promise(function (r) {
    setTimeout(r, ms);
  });
}

function existaA1() {
  var url =
    '/20160918/shapes?compartmentId=' +
    TENANCY +
    '&imageId=' +
    IMAGINE_UBUNTU_22_04 +
    '&shape=' +
    encodeURIComponent(SHAPE_CAUTAT);
  return get(url).then(function (r) {
    return Array.isArray(r) && r.some(function (s) {
      return s.shape === SHAPE_CAUTAT;
    });
  });
}

async function main() {
  var inceput = Date.now();
  var tentativa = 0;

  scrie('Veghe pornita. Urmaresc ' + SHAPE_CAUTAT + ', verific la fiecare ' + INTERVAL_MIN + ' min.');

  for (;;) {
    tentativa = tentativa + 1;
    var trecuta = Math.round((Date.now() - inceput) / 60000);
    var are = false;

    try {
      are = await existaA1();
    } catch (e) {
      scrie('  tentativa ' + tentativa + ': verificare esuata: ' + String(e.message).slice(0, 90));
      are = false;
    }

    if (are) {
      scrie('');
      scrie('>>> SLOT DISPONIBIL: ' + SHAPE_CAUTAT + ' se poate crea acum.');
      scrie('>>> Mergi in consola OCI si apasa Create pe formularul completat.');
      scrie('>>> Sau creaza prin API: node module-6/creaza-instanta.js');
      process.exit(0);
    }

    scrie('  tentativa ' + tentativa + ' (' + trecuta + ' min): inca fara capacitate.');

    if (!nelimitat && trecuta >= MAX_ORE * 60) {
      scrie('Oprit dupa ' + MAX_ORE + 'h fara slot. Ruleaza din nou oricand.');
      process.exit(1);
    }

    await dorma(INTERVAL_MIN * 60 * 1000);
  }
}

main();
