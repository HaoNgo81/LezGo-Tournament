# STEP 13 - Remote Read-Only UI

Dato: 2026-08-13

Status: Implementeret lokalt. Ingen push.

## Scope

STEP 13 gør STEP 12-adgangen brugbar i appens normale UI.

`localStorage` er stadig primary persistence. En turnering åbnet fra en anden enhed holdes som en separat remote preview i React state og må ikke gemmes som lokal primary turnering.

Ingen locked tournament logic er ændret.

## UI-flow

Forsiden har en ny handling:

- Dansk: `Åbn turnering fra anden enhed`
- Engelsk: `Open tournament from another device`

Siden `/remote` viser:

- tournament code
- share token som masked input
- show/hide for token
- loading, fejl og successtatus

Tournament code normaliseres til uppercase i UI. Backend lookup er fortsat case-insensitive via STEP 12.

## Remote Read-Only Mode

Når turneringen er hentet, vises en tydelig read-only banner:

- Dansk: `Visning fra anden enhed - skrivebeskyttet`
- Engelsk: `Opened from another device - read only`

Remote-visningen har ingen score-, edit-, finish-, delete-, settings- eller next-round handlinger. Relevante mutationskontroller vises kun som disabled forklaring, hvor det hjælper brugeren med at forstå read-only status.

## Data

Remote-visningen bruger eksisterende read-back/runtime state fra STEP 12 og eksisterende read-only view helpers:

- standard tournaments
- pool/later-stage tournaments
- Team vs Team

Der er ingen parallel tournament engine i UI-komponenten.

## Refresh

Knappen `Opdater` / `Refresh` kalder samme sikre server-side read endpoint igen.

Hvis refresh fejler, beholdes senest viste remote snapshot i memory. Lokal primary localStorage påvirkes ikke.

## Device A Access UX

Sync-status panelet kan oprette adgang for turneringer, der allerede har et Supabase UUID fra shadow-save.

Raw share token:

- vises ikke direkte i UI
- kan kopieres umiddelbart efter initial provisioning
- gemmes ikke i localStorage
- gemmes ikke i Supabase i klartekst
- kan ikke vises igen ved repeated provision

Hvis token er væk, skal et sikkert regenerate-flow bygges senere.

## QR Foundation

STEP 14 kan bygge videre på samme model:

- code identificerer turneringen
- en sikker handoff-reference kan tilføjes
- raw token bør ikke gemmes i databasen eller lægges i permanente logs

## Database

Ingen databaseændringer i STEP 13.

STEP 12-tabellen `tournament_access` og server routes genbruges uændret.

## Persistence

Efter STEP 13:

- localStorage er primary persistence
- Supabase er shadow/read backend
- remote preview er read-only
- Device B har ingen write access

## Mangler før Device B må redigere

- auth/access policy for write access
- token rotation/regeneration UX
- conflict UX for remote edits
- Realtime eller polling-strategi
- kontrolleret promotion/import fra remote til local primary
