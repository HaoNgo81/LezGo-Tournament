# STEP 17 - Remote Session for Tournament-Day TV

Dato: 2026-08-13

Status: Implementeret lokalt. Ingen push.

## Scope

STEP 17 gør remote/TV-visningen uafhængig af den kortlivede QR/handoff-reference efter første sikre forbindelse.

Device B er fortsat read-only. `localStorage` er fortsat primary persistence på Device A.

Ingen turneringsmotor, scoring, ranking, rundealgoritme, Team vs Team runtime eller låst formatlogik er ændret.

## Arkitektur

QR/handoff er kun bootstrap.

Efter en gyldig handoff redemption eller manuel adgang opretter serveren et signeret remote-session token:

- scope: `remote-read`
- tournament id
- tournament access id
- access token version
- issued-at
- expiry
- nonce
- HMAC-signatur

Browseren får kun det signerede session-token. Browseren får aldrig service-role key, permanent share token hash eller andre server-secrets.

## Session Lifetime

Remote-sessionen lever i 12 timer.

Tokenet gemmes i `sessionStorage` på Device B, så en almindelig refresh kan genetablere den samme read-only visning uden at redeem'e QR-linket igen.

## Server-Side Validation

Hver remote-session read validerer:

- token format og signatur
- expiry
- scope
- tournament id
- access id
- `tournament_access.revoked_at`
- `tournament_access.token_version`
- at access-rækken stadig peger på samme turnering

Derefter læses snapshot server-side via eksisterende Supabase repositories.

## Revoke og Expiry

Udløbet session returnerer terminal expiry-fejl og stopper polling.

Revoked eller manipuleret session returnerer access-denied og stopper polling.

En session kan ugyldiggøres ved at revoke eksisterende `tournament_access` eller rotere `token_version`.

## Database

Ingen databaseændringer.

Ingen migration.

Ingen RLS-ændring.

Ingen eksisterende data migreret eller slettet.

## Sync

Polling fra STEP 16 fortsætter.

Efter første sikre forbindelse bruger polling `/api/supabase/remote-session/read` i stedet for det kortlivede handoff endpoint.

Manuel `Opdater` bruger samme session-read flow.

## Sikkerhed

- Device B har ingen write API
- sessionen er scoped til én turnering
- manipuleret session afvises
- udløbet session afvises
- revoked access afvises
- ingen service-role key i browser
- ingen public writes
- RLS bevares

## Verifikation

Udvidede tests:

- `tests/remote-session.test.ts`
- `tests/remote-tournament-app.test.tsx`
- `tests/supabase-step17-e2e.test.ts`

Dækker:

- signeret remote-session
- token expiry
- manipuleret token
- revoked/mismatched access
- QR bootstrap til session polling
- refresh recovery via `sessionStorage`
- terminal expiry stopper polling
- Supabase round-trip for standard, Mexicano, pool/later-stage og Team vs Team

## Persistence Efter STEP 17

- Device A: `localStorage` primary
- Supabase: shadow/read backend
- Device B: read-only remote live view
- Sync: robust polling via long-lived remote-session
- Realtime: ikke aktiveret
- locked tournament formats changed: NO
