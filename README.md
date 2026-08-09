# Årsnes Gård

Nettside for Årsnes Gård i Kinsarvik — alkoholfri eplecider presset på gården.

Statisk frontend (nginx) + et lite bestillings-API (Node) som sender varsel til
ntfy når noen legger inn en bestilling.

## Innhold

| Fil | Beskrivelse |
|---|---|
| `index.html` | Hele nettsiden — HTML, CSS og JS i én fil |
| `nginx.conf` | Serverkonfigurasjon for frontend |
| `Dockerfile` | Bygger frontend-imaget |
| `backend/server.js` | Bestillings-API, ingen npm-avhengigheter |
| `backend/Dockerfile` | Bygger API-imaget |
| `compose.yaml` | Begge tjenester, med Traefik-labels for `edge`-nettverket |
| `.env.example` | Mal for miljøvariabler |

## Kjøre lokalt

```bash
cp .env.example .env      # fyll inn NTFY_URL
docker compose up -d --build
```

Krever et eksternt Docker-nettverk ved navn `edge` og en Traefik-instans på det
nettverket. Se `DEPLOY.md` for full oppsettsguide.

## API

| Endepunkt | Metode | Beskrivelse |
|---|---|---|
| `/api/helse` | GET | Helsesjekk, svarer `{"status":"ok"}` |
| `/api/bestill` | POST | Tar imot bestilling og varsler via ntfy |

Eksempel:

```bash
curl -X POST https://aarsnesgard.frekarlsen.com/api/bestill \
  -H 'Content-Type: application/json' \
  -d '{"navn":"Kari Nordmann","telefon":"90012345","variant":"Halvtørr","antall":6}'
```

Innebygde beskyttelser: honeypot-felt, rate limit på 5 sendte bestillinger per
IP per 10 minutter, lengdebegrensning på alle felter, og maks 10 kB request body.

## Plassholdere som må erstattes

Søk etter `PLASSHOLDER` i `index.html`:

- Bilde av gården
- Telefonnummer og e-postadresse
- Organisasjonsnummer
- Pris per flaske
- Årstall og antall eplesorter
- Variantnavn og smaksbeskrivelser

Endres variantnavnene, må `VARIANTER` i `backend/server.js` oppdateres likt.

## Innhold i cideren

Cideren er alkoholfri (under 0,7 %). Det betyr at den ikke omfattes av
alkoholloven, og at den kan selges og omtales fritt på nett. Skulle produktet
senere gå over 0,7 %, kreves både bevilling og en gjennomgang av all
markedsføringstekst.
