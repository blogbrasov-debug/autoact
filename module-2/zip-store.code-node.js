/* ============================================================
 * AutoAct | Modul 2 – Pas 6b | Arhivare ZIP fără dependențe
 * JavaScript pur pentru nodul "Code" din n8n. Construiește un
 * fișier .zip valid (metoda STORE — PDF-urile sunt deja
 * comprimate, deci nu pierzi nimic) fără npm install.
 *
 * Setare necesară în docker-compose.yml (Modulul 3):
 *   NODE_FUNCTION_ALLOW_BUILTIN=fs,path
 * ============================================================ */
'use strict';

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xFF];
  return (c ^ -1) >>> 0;
}

function dosDateTime(d) {
  const timp = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const data = (((d.getFullYear() - 1980) & 0x7F) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { timp, data };
}

/**
 * creeazaZip([{ nume: 'contract.pdf', buffer: Buffer }, ...]) → Buffer (zip valid)
 */
function creeazaZip(fisiere) {
  if (!fisiere || fisiere.length === 0) throw new Error('creeazaZip: lista de fișiere este goală.');
  const acum = dosDateTime(new Date());
  const bucati = [];
  const central = [];
  let offset = 0;

  for (const f of fisiere) {
    const nume = Buffer.from(String(f.nume), 'utf8');
    const continut = Buffer.isBuffer(f.buffer) ? f.buffer : Buffer.from(f.buffer);
    const crc = crc32(continut);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);   // semnătura Local File Header
    local.writeUInt16LE(20, 4);           // versiune minimă necesară
    local.writeUInt16LE(0x0800, 6);       // flag: nume UTF-8
    local.writeUInt16LE(0, 8);            // metoda 0 = STORE (fără compresie)
    local.writeUInt16LE(acum.timp, 10);
    local.writeUInt16LE(acum.data, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(continut.length, 18);
    local.writeUInt32LE(continut.length, 22);
    local.writeUInt16LE(nume.length, 26);
    local.writeUInt16LE(0, 28);
    bucati.push(local, nume, continut);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);      // semnătura Central Directory
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(0, 10);              // metoda STORE
    cd.writeUInt16LE(acum.timp, 12);
    cd.writeUInt16LE(acum.data, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(continut.length, 20);
    cd.writeUInt32LE(continut.length, 24);
    cd.writeUInt16LE(nume.length, 28);
    cd.writeUInt32LE(offset, 42);         // offset-ul header-ului local
    central.push(Buffer.concat([cd, nume]));

    offset += 30 + nume.length + continut.length;
  }

  const director = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);      // End Of Central Directory
  eocd.writeUInt16LE(fisiere.length, 8);
  eocd.writeUInt16LE(fisiere.length, 10);
  eocd.writeUInt32LE(director.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...bucati, director, eocd]);
}

/* ── Cum se folosește în n8n ──────────────────────────────────
 * Nod "Code", Mode: "Run Once for All Items". Lipește TOT
 * fișierul, apoi adaugă la final:

 *   const fs = require('fs');              // permis prin NODE_FUNCTION_ALLOW_BUILTIN=fs,path
 *   const path = require('path');
 *   const dir = '/home/node/local/' + $json.id_tranzactie;   // volum montat (Modulul 3)
 *   const fisiere = fs.readdirSync(dir)
 *     .filter((f) => f.endsWith('.pdf'))
 *     .sort()
 *     .map((f) => ({ nume: f, buffer: fs.readFileSync(path.join(dir, f)) }));
 *   const arhiva = creeazaZip(fisiere);
 *   const numeZip = $json.id_tranzactie + '.zip';
 *   const binar = await this.helpers.prepareBinaryData(arhiva, numeZip, 'application/zip');
 *   return [{ json: { ...$json, zip_nume: numeZip }, binary: { data: binar } }];
 * ──────────────────────────────────────────────────────────── */

module.exports = { creeazaZip, crc32 };

/* Test local:  node module-2/zip-store.code-node.js */
if (require.main === module) {
  const fs = require('fs');
  const fakePdf = Buffer.from('%PDF-1.7\n% AutoAct test\n' + 'A'.repeat(5000));
  const arhiva = creeazaZip([
    { nume: '01-contract-vanzare-cumparare.pdf', buffer: fakePdf },
    { nume: '02-cerere-drpciv.pdf', buffer: Buffer.from('%PDF-1.7\n' + 'B'.repeat(2000)) },
    { nume: '03-declaratii-fiscale.pdf', buffer: Buffer.from('%PDF-1.7\n' + 'C'.repeat(1000)) }
  ]);
  fs.writeFileSync('exemplu-arhiva.zip', arhiva);
  console.log('OK → exemplu-arhiva.zip (' + arhiva.length + ' octeți). Verifică cu: unzip -t exemplu-arhiva.zip');
}
