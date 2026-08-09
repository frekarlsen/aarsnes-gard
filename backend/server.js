// Årsnes Gård — bestillings-API
// Ingen npm-avhengigheter. Krever Node 18+ (bruker innebygd fetch).
//
// Miljøvariabler:
//   NTFY_URL    (påkrevd)  full URL til ntfy-topic, f.eks. http://10.0.0.5:8080/aarsnesgard
//   NTFY_TOKEN  (valgfri)  Bearer-token hvis ntfy krever autentisering
//   PORT        (valgfri)  standard 3000

const http = require('http');

const NTFY_URL = process.env.NTFY_URL;
const NTFY_TOKEN = process.env.NTFY_TOKEN || '';
const PORT = parseInt(process.env.PORT || '3000', 10);

if (!NTFY_URL) {
  console.error('FEIL: NTFY_URL er ikke satt. Avslutter.');
  process.exit(1);
}

// --- Enkel rate limit: maks 5 bestillinger per IP per 10 minutter ---
const hits = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_HITS = 5;

// Sjekk og registrering er delt, slik at skrivefeil i skjemaet ikke
// bruker opp kvoten — bare bestillinger som faktisk sendes teller.
function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  hits.set(ip, recent);
  return recent.length >= MAX_HITS;
}

function registrerTreff(ip) {
  const recent = hits.get(ip) || [];
  recent.push(Date.now());
  hits.set(ip, recent);
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, arr] of hits) {
    const recent = arr.filter((t) => now - t < WINDOW_MS);
    if (recent.length === 0) hits.delete(ip);
    else hits.set(ip, recent);
  }
}, WINDOW_MS).unref();

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function clean(s, max) {
  return String(s ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
}

// Må stemme med <select> i index.html
const VARIANTER = ['Tørr', 'Halvtørr', 'Søt'];

const server = http.createServer((req, res) => {
  const ip =
    req.headers['cf-connecting-ip'] ||
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket.remoteAddress;

  if (req.method === 'GET' && req.url === '/api/helse') {
    return json(res, 200, { status: 'ok' });
  }

  if (req.method !== 'POST' || req.url !== '/api/bestill') {
    return json(res, 404, { feil: 'Ikke funnet' });
  }

  let raw = '';
  let overflow = false;

  req.on('data', (chunk) => {
    raw += chunk;
    if (raw.length > 10000) {
      overflow = true;
      req.destroy();
    }
  });

  req.on('close', async () => {
    if (overflow || res.writableEnded) return;

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return json(res, 400, { feil: 'Ugyldig forespørsel.' });
    }

    // Honeypot: feltet "nettsted" er skjult i skjemaet. Utfylt = bot.
    if (data.nettsted) {
      console.log(`[${new Date().toISOString()}] Honeypot utløst fra ${ip}`);
      return json(res, 200, { ok: true });
    }

    if (rateLimited(ip)) {
      return json(res, 429, { feil: 'For mange bestillinger på kort tid. Prøv igjen om litt, eller ring oss.' });
    }

    const navn = clean(data.navn, 100);
    const telefon = clean(data.telefon, 20);
    const variant = clean(data.variant, 20);
    const antall = parseInt(data.antall, 10);
    const kommentar = clean(data.kommentar, 500);

    if (navn.length < 2) return json(res, 400, { feil: 'Skriv inn navnet ditt.' });
    if (!/^[+\d][\d\s]{6,}$/.test(telefon)) return json(res, 400, { feil: 'Skriv inn et gyldig telefonnummer.' });
    if (!VARIANTER.includes(variant)) return json(res, 400, { feil: 'Velg en variant.' });
    if (!Number.isInteger(antall) || antall < 1 || antall > 60) return json(res, 400, { feil: 'Velg mellom 1 og 60 flasker.' });

    const melding = [
      `Navn: ${navn}`,
      `Telefon: ${telefon}`,
      `Variant: ${variant}`,
      `Antall flasker: ${antall}`,
      kommentar ? `Kommentar: ${kommentar}` : null
    ].filter(Boolean).join('\n');

    try {
      const headers = {
        'Title': `Ny ciderbestilling: ${antall} x ${variant}`,
        'Priority': 'high',
        'Tags': 'apple',
        'Content-Type': 'text/plain; charset=utf-8'
      };
      if (NTFY_TOKEN) headers.Authorization = `Bearer ${NTFY_TOKEN}`;

      const r = await fetch(NTFY_URL, { method: 'POST', headers, body: melding });
      if (!r.ok) throw new Error(`ntfy svarte ${r.status}`);

      registrerTreff(ip);
      console.log(`[${new Date().toISOString()}] Bestilling fra ${ip}: ${antall} x ${variant} (${navn})`);
      return json(res, 200, { ok: true });
    } catch (err) {
      console.error('Klarte ikke sende varsel til ntfy:', err.message);
      return json(res, 502, { feil: 'Bestillingen ble ikke sendt. Prøv igjen, eller ring oss.' });
    }
  });
});

server.listen(PORT, () => console.log(`Bestillings-API lytter på port ${PORT}`));
