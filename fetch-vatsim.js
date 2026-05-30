const https = require('https');
const fs    = require('fs');

const AIRPORTS     = ['EHRD', 'EHAM', 'EHGG', 'EHEH'];
const DATA_URL     = 'https://data.vatsim.net/v3/vatsim-data.json';
const BOOK_URL     = 'https://atc-bookings.vatsim.net/api/bookings';
const ROLE_SUFFIXES = {
  DEL: ['_DEL'],
  GND: ['_GND', '_AGND', '_RAMP'],
  TWR: ['_TWR'],
  APP: ['_APP', '_DEP']
};

function getRole(cs) {
  cs = cs.toUpperCase();
  for (const r in ROLE_SUFFIXES)
    for (const s of ROLE_SUFFIXES[r])
      if (cs.includes(s)) return r;
  return null;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch(e) { reject(e); } });
    }).on('error', reject);
  });
}

async function main() {
  const [data, bookRaw] = await Promise.all([
    fetchJson(DATA_URL),
    fetchJson(BOOK_URL).catch(() => [])
  ]);

  const controllers = data.controllers || [];
  const pilots      = data.pilots      || [];
  const bookings    = Array.isArray(bookRaw) ? bookRaw : (bookRaw.data || []);

  const out = { updated: new Date().toISOString(), airports: {} };

  for (const icao of AIRPORTS) {
    const ap = {
      controllers: { DEL: null, GND: null, TWR: null, APP: null },
      traffic:     { departures: 0, arrivals: 0, airborne_departures: 0, airborne_arrivals: 0 },
      bookings:    []
    };

    for (const c of controllers) {
      const cs = (c.callsign || '').toUpperCase();
      if (!cs.startsWith(icao)) continue;
      const role = getRole(cs);
      if (role && ap.controllers[role] === null)
        ap.controllers[role] = { callsign: cs, frequency: c.frequency || null };
    }

    for (const p of pilots) {
      const fp = p.flight_plan;
      if (!fp) continue;
      const gs = p.groundspeed || 0;
      if ((fp.departure || '').toUpperCase() === icao) {
        ap.traffic.departures++;
        if (gs > 50) ap.traffic.airborne_departures++;
      }
      if ((fp.arrival || '').toUpperCase() === icao) {
        ap.traffic.arrivals++;
        if (gs > 50) ap.traffic.airborne_arrivals++;
      }
    }

    for (const b of bookings) {
      const bcs = (b.callsign || b.position || '').toUpperCase();
      if (!bcs.startsWith(icao)) continue;
      ap.bookings.push({
        callsign: bcs,
        start: b.time_start || b.start || null,
        end:   b.time_end   || b.end   || null
      });
    }

    out.airports[icao] = ap;
  }

  fs.writeFileSync('vatsim.json', JSON.stringify(out));
  console.log('Written vatsim.json —', out.updated);
}

main().catch(e => { console.error(e); process.exit(1); });
