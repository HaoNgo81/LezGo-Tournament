# STEP 18 - TV / Remote Display UX

Dato: 2026-08-13

Status: Implementeret lokalt. Ingen push.

## Scope

STEP 18 forbedrer den eksisterende remote read-only visning, så Device B kan bruges praktisk som TV/tablet display under en turneringsdag.

Dette step ændrer kun remote display-UX. Ingen turneringsmotor, scoring, ranking, rundealgoritme, Team vs Team runtime eller låst formatlogik er ændret.

## TV Layout

Remote-visningen viser nu et dashboard bygget på eksisterende read-only snapshot data:

- turneringsnavn og format/round metadata
- live connection status
- aktuelle kampe
- live score med større tal
- stilling/rangliste
- pool/later-stage panels
- Team vs Team panels

På brede skærme vises `Kampe` og `Live score` side om side.

På mobil og portrait fortsætter layoutet som et vertikalt stack.

## TV Mode

Device B har en `TV-visning` / `TV View` knap.

Remote-links kan også åbne direkte i TV mode med query-parametret `?display=tv`. Det ændrer kun startvisningen på Device B og giver ingen skriveadgang.

Når TV mode er aktiv:

- indholdet bruger mere af viewporten
- typografi og scores bliver større
- kampe/live score prioriteres
- sekundære spiller-/kaptajnpaneler nedtones eller skjules, hvor det giver bedre TV-fokus

Der er også en frivillig `Fuld skærm` / `Fullscreen` knap via browserens Fullscreen API.

## Live Status og Ny Forbindelse

Live status fra STEP 16 er bevaret:

- Forbinder
- Live
- Forbinder igen
- Offline
- Fejl

Ved terminal sessionfejl vises en tydelig TV-forbindelsesbesked og knappen `Ny forbindelse`.

Knappen rydder den lokale remote-session og sender brugeren tilbage til det eksisterende sikre QR/handoff/manual access flow.

## Session og Sikkerhed

STEP 17 remote-session modellen er uændret:

- 12 timers read-only remote-session
- `sessionStorage`
- server-signed session token
- server-side validation
- tournament isolation
- revoke/expiry protection

Device B har fortsat ingen write controls og ingen write API.

## Database

Ingen databaseændringer.

Ingen migration.

Ingen RLS-ændring.

Ingen eksisterende data migreret eller slettet.

## Verifikation

Udvidede tests:

- `tests/remote-tournament-app.test.tsx`

Dækker:

- TV mode toggle
- fullscreen control
- dashboard headings for Kampe, Live score og Stilling
- terminal session expiry med Ny forbindelse
- eksisterende STEP 15/16/17 remote polling/recovery regressioner
- dansk og engelsk remote UI

Browser-QA:

- 1920x1080 TV viewport
- tablet landscape
- mobile portrait

## Persistence Efter STEP 18

- Device A: `localStorage` primary
- Supabase: shadow/read backend
- Device B: read-only remote live display
- Sync: robust polling via remote-session
- Realtime: ikke aktiveret
- locked tournament formats changed: NO
