# STEP 12 - Secure Multi-Device Read Foundation

Dato: 2026-08-13

Status: Implementeret lokalt. Ingen push.

## Scope

STEP 12 etablerer sikker server-side read/adgang til shadow-saved turneringer.

`localStorage` er stadig primary persistence. Tablet B kan læse en Supabase snapshot i test/dev flow, men overtager ikke primary persistence og kan ikke skrive.

Ingen locked tournament logic er ændret.

## Arkitekturvalg

Valgt adgangsmodel:

- Tournament code identificerer turneringen.
- Share token fungerer som hemmeligt adgangscredential.
- Databasen gemmer kun hash af share token.
- Browseren får aldrig service-role credentials.
- Browseren læser aldrig direkte fra privileged Supabase-tabeller.

Dette giver et sikkert fundament til midlertidig deling uden at kræve fuld bruger-login i første version.

## Tournament Code

Format:

`[A-HJ-NP-Z2-9]{6}`

Eksempel:

`K7M4XP`

Design:

- 6 tegn
- case-insensitive
- ingen `O`, `0`, `I`, `1`
- alfabet: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`
- ca. 1 milliard kombinationer
- collision håndteres ved retry ved database unique conflict

Code må identificere turneringen, men giver ikke alene adgang.

## Share Token

Share token:

- genereres server-side med cryptographically secure random bytes
- 32 bytes entropy
- returneres kun ved initial provision
- gemmes aldrig i klartekst i databasen
- database gemmer SHA-256 hash
- valideres server-side med timing-safe comparison

Repeated provision returnerer eksisterende tournament code, men ikke raw token igen.

## Database

Ny additiv migration:

`20260813000700_step_12_tournament_access.sql`

Ny tabel:

`tournament_access`

Felter:

- `tournament_id`
- `tournament_code`
- `share_token_hash`
- `token_version`
- `revoked_at`
- timestamps
- metadata

RLS er enabled. Kun `service_role` har table grants.

Eksisterende shadow-saved turneringer får ikke automatisk access rows. De er dermed legacy/no-access-token indtil der eksplicit provisioneres adgang.

## Server Boundary

Provision:

`POST /api/supabase/tournament-access/provision`

Read:

`POST /api/supabase/tournament-access/read`

Begge routes er server-side gated med:

`LEZGO_ENABLE_SUPABASE_ACCESS=1`

Privileged Supabase calls sker kun server-side.

## Read Flow

```text
tournament code + share token
  -> server route
  -> normalize code
  -> lookup tournament_access
  -> reject missing/revoked/mismatched token
  -> read tournament rows server-side
  -> read-back mapper
  -> return runtime state
```

Unauthorized access returnerer ikke tournament state.

## Rate Limit

Read-route har en simpel in-memory per code/IP guard:

- 20 forsøg
- 60 sekunder

Dette er kun en foundation. Production bør bruge Vercel KV, Upstash Redis, Supabase edge rate-limit eller lignende delt storage, fordi serverless instances ikke deler memory.

## Multi-Device Proof Of Concept

E2E-test:

1. Device A gemmer `STEP_12_TEST` turnering i Supabase.
2. Server provisionerer tournament code + share token.
3. Device B simuleres uden A's localStorage.
4. Device B læser via code/token server-route.
5. Runtime state rekonstrueres fra Supabase rows.

Dækket:

- Standard Americano
- Pool/later-stage
- Team vs Team
- invalid token
- wrong code
- missing token
- revoked token
- repeated provision

## Offline Safety

STEP 12 ændrer ikke offline behavior.

Hvis access/read fejler:

- aktiv localStorage-turnering påvirkes ikke
- ingen lokale data slettes
- ingen blank remote state erstatter lokal state

## Mangler Før Tablet B Kan Fortsætte/Redigere

- UI til at indtaste tournament code/share token
- Lokal import af read-only snapshot som valgt turnering
- Write access policy for Device B
- Conflict-resolution UX for samtidige edits
- Realtime/sync eller polling model
- Share-token rotation/recovery flow

## Mangler Før Supabase Primary

- Auth/share-token endelig production-beslutning
- Server-side read/write API med adgangskontrol
- Migration/import af eksisterende localStorage-data
- Conflict resolution
- Device handoff UX
- Realtime design
