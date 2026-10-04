// Creează serverul AutoAct pe Oracle Cloud Free Tier, prin API.
// Încearcă VM.Standard.A1.Flex (2 OCPU / 12 GB) și repetă automat când Oracle
// răspunde "Out of capacity" — capacitatea se eliberează neregulat.
//
//   node module-6/creaza-instanta.js            -> încearcă o dată, cu reluare la 30s
//   node module-6/creaza-instanta.js --asteapta  -> reîncearcă la infinit (30s pauză)
//
// La final afișează IP-ul public, de care are nevoie deploy-ul.

const { request, get, config } = require('./oci-client.js');

const TENANCY = config().tenancy;
const COMPARTMENT = TENANCY;

const IMAGINE_UBUNTU_22_04 =
  'ocid1.image.oc1.eu-stockholm-1.aaaaaaaaxc4wsbihf633lzj7ot6bnbgounsgdqj5opuz5ynbi3xnw2gbpwxq';
const SHAPE = 'VM.Standard.A1.Flex';
const OCPU = 2;
const RAM_GB = 12;
const NUME = 'autoact';

// Subnetul e regional, deci availabilityDomain nu este obligatoriu —
// Oracle alege singur domainul. Dacă îl forțăm, trebuie exact `wFBv:EU-STOCKHOLM-1-AD-1`.

const CHEIE_SSH =
  'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIG3b33/46C/mEmzDDskcomxIG675xLkqNk3y+HyFJ0BO host-pcasus';

const PAUZA_MS = 30_000;
const asteaptaInfinit = process.argv.includes('--asteapta');

function gasesteSubnet() {
  return get(
    `/20160918/subnets?compartmentId=${COMPARTMENT}&compartmentIdInSubtree=true`,
  ).then((subnets) => {
    const s = subnets.find((x) => x.displayName === 'autoact-public') || subnets[0];
    if (!s) throw new Error('Nu am gasit niciun subnet');
    return s;
  });
}

async function existaInstanta() {
  const inst = await get(`/20160918/instances?compartmentId=${COMPARTMENT}`);
  const mea = inst.find((i) => i.displayName === NUME);
  return mea || null;
}

function asteapta(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function creare(subnet) {
  const body = JSON.stringify({
    displayName: NUME,
    imageId: IMAGINE_UBUNTU_22_04,
    shape: SHAPE,
    shapeConfig: { ocpus: OCPU, memoryInGBs: RAM_GB },
    compartmentId: COMPARTMENT,
    createVnicDetails: {
      assignPublicIp: true,
      subnetId: subnet.id,
    },
    metadata: {
      ssh_authorized_keys: CHEIE_SSH,
      display_name: NUME,
    },
  });

  return request('POST', '/20160918/instances', { body });
}

function esteCapacitate(e) {
  const msg = (e.message || '') + JSON.stringify(e.body || {});
  return /out of capacity|InternalError.*capacity|not available/i.test(msg);
}

async function asteaptaRidicare(id) {
  for (;;) {
    const inst = await get(`/20160918/instances/${id}`);
    if (inst.lifecycleState === 'RUNNING') return inst;
    if (inst.lifecycleState === 'TERMINATED') throw new Error('Instanta a murit');
    process.stdout.write(`  stare: ${inst.lifecycleState}\n`);
    await asteapta(10_000);
  }
}

async function ipPentru(inst) {
  // VNIC-ul se găsește listând VNIC-urile din tenancy și filtrând după instanță.
  try {
    const vnics = await get(`/20160918/vnics?compartmentId=${COMPARTMENT}`);
    const meu = vnics.find((v) => v.instanceId === inst.id);
    return meu ? meu.publicIp : null;
  } catch {
    return null;
  }
}

(async () => {
  const subnet = await gasesteSubnet();
  console.log('Subnet:', subnet.displayName, subnet.id);

  const existenta = await existaInstanta();
  if (existenta) {
    console.log('Instanta exista deja:', existenta.id, existenta.lifecycleState);
    if (existenta.lifecycleState !== 'RUNNING') {
      await asteaptaRidicare(existenta.id);
    }
    const inst = await get(`/20160918/instances/${existenta.id}`);
    const ip = await ipPentru(inst);
    console.log('\nIP PUBLIC:', ip || '(ncapat inca)');
    return;
  }

  for (let i = 1; ; i++) {
    console.log(`\n[ incercarea ${i} ] creez ${SHAPE} ${OCPU} OCPU / ${RAM_GB} GB`);
    try {
      const inst = await creare(subnet);
      console.log('  creata:', inst.id, inst.lifecycleState);
      await asteaptaRidicare(inst.id);
      const gata = await get(`/20160918/instances/${inst.id}`);
      const ip = await ipPentru(gata);
      console.log('\nSERVER ONLINE');
      console.log('  instance id:', gata.id);
      console.log('  IP PUBLIC:', ip);
      if (ip) console.log('\n  urmatorul pas:  cd module-3 && bash deploy-autoact.sh ubuntu@' + ip + ' autoact.eu');
      return;
    } catch (e) {
      if (esteCapacitate(e)) {
        console.log('  fara capacitate A1.Flex — reincearc peste 30s');
        if (!asteaptaInfinit) {
          // Un singur retry, ca sa nu blocam la nesfarsit.
          if (i >= 20) {
            console.log('Am renuntat dupa 20 de incercari. Ruleaza din nou cand vrei.');
            process.exitCode = 1;
            return;
          }
        }
        await asteapta(PAUZA_MS);
        continue;
      }
      console.log('  EROARE:', e.message);
      process.exitCode = 1;
      return;
    }
  }
})().catch((e) => {
  console.error('EROARE:', e.message);
  process.exitCode = 1;
});
