# STEP 14 - Secure QR / Device Handoff

Dato: 2026-08-13

Status: Implementeret lokalt. Ingen push.

## Scope

STEP 14 tilføjer en nem QR/link-adgang til den eksisterende STEP 13 remote read-only visning.

`localStorage` er stadig primary persistence på Device A. Device B modtager kun et read-only snapshot via server-side Supabase access og må ikke gemme, redigere eller overskrive lokal turneringsdata.

Ingen locked tournament logic er ændret.

## Sikkerhedsmodel

QR-koden indeholder en kortlivet handoff-reference, ikke den permanente share token.

Valgt model:

- kryptografisk random reference
- raw reference returneres kun til Device A UI og placeres i QR/link
- Supabase gemmer kun SHA-256 hash af referencen
- reference udløber efter 10 minutter
- kontrolleret genbrug indtil udløb, så Device B kan bruge `Opdater`
- server-side validering med service role
- read-only snapshot returneres gennem eksisterende read-back/repository-lag

Kontrolleret genbrug er valgt frem for strikt single-use, fordi read-only Device B ellers ikke kan opdatere visningen efter første scanning. Reuse er stadig begrænset af kort levetid, rate limiting, revocation og server-side checks.

## Routes

- `POST /api/supabase/tournament-handoff/provision`
  - input: `tournamentId`
  - server opretter eller genbruger sikker `tournament_access`
  - opretter `tournament_handoffs`
  - returnerer `handoffUrl`, `handoffReference`, `expiresAt`

- `POST /api/supabase/tournament-handoff/redeem`
  - input: `handoffReference`
  - validerer hash, expiry, revocation og access
  - returnerer standard eller Team vs Team runtime snapshot

- `/remote/handoff/[reference]`
  - Device B auto-åbner remote read-only visningen

## Database

Ny additiv tabel:

- `public.tournament_handoffs`

Felter:

- `id`
- `tournament_access_id`
- `handoff_token_hash`
- `created_at`
- `updated_at`
- `expires_at`
- `first_used_at`
- `last_used_at`
- `use_count`
- `revoked_at`
- `metadata`

Relation:

- `tournament_handoffs.tournament_access_id -> tournament_access.id on delete cascade`

Indexes:

- `tournament_handoffs_access_id_idx`
- `tournament_handoffs_token_hash_idx`
- `tournament_handoffs_expires_at_idx`

RLS:

- enabled
- anon/authenticated grants er eksplicit revoked
- service_role har select/insert/update/delete

## UI

Device A sync-panelet viser:

- `Vis på anden enhed`
- QR-kode
- udløbstidspunkt
- read-only link
- `Kopier link`
- `Generér ny QR-kode`

Manuel STEP 13-adgang med tournament code + share token er bevaret.

Device B viser fortsat eksisterende STEP 13 read-only renderer og har ingen mutationsknapper.

## Rate Limiting

Handoff redeem endpoint har samme in-memory route-level rate-limit mønster som STEP 13 access read.

Fejl for invalid/manipulated/revoked references bruger generiske beskeder og afslører ikke om en reference eller turnering eksisterer.

## Realtime Forberedelse

Handoff-tabellen peger på `tournament_access`, ikke direkte på en renderer. Det gør det muligt senere at lade samme read-only session poll'e eller abonnere på Supabase Realtime uden at ændre QR-formatet til permanente credentials.

## Persistence Efter STEP 14

- localStorage: primary persistence
- Supabase: shadow/read backend
- QR handoff: kortlivet read-only access
- Device B write access: ikke implementeret
- Realtime: ikke implementeret
