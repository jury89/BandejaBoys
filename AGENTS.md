# Contributor instructions

## Required validation

Run `npm run check` before every commit or push. It must complete lint, all tests and the production build without errors. After UI changes, also test the relevant flow at desktop and mobile widths.

## Domain invariants

- Signup precedence is chronological. Never reorder signups manually in UI code.
- The first four ordered signups are starters; all later signups are reserves.
- Removing a starter promotes the first reserve by derivation, not by a second write.
- A direct substitution keeps the outgoing starter's position and removes an existing reserve entry for the replacement.
- `collecting` and `ready` are derived states. Persist only booking facts (`bookedAt`, venue and actor).
- Mutations of a Firestore poll must remain transactional.

## Project structure

- Pure rules belong in `src/lib/domain.ts` and need unit tests.
- Notification audience and timing rules belong in `src/lib/notificationSchedule.ts`; keep them pure and cover new polls, starters, reserves, 24-hour reminders and 2-hour reminders with unit tests.
- Remote and demo persistence implement the same interface in `src/lib/repository.ts`.
- Firebase credentials stay in local environment files. Never commit tokens, service accounts or admin keys.
- Never commit the Web Push VAPID private key or notifier password. They belong only in GitHub Actions secrets; the VAPID public key may be part of the Vite environment.
- Update `README.md` and `docs/architecture.md` when setup, workflow or data rules change.

## Product constraints

This is a single-group, private tool designed to stay on Firebase's no-cost Spark plan. Do not introduce Cloud Functions, paid infrastructure, analytics or public-discovery features without an explicit product decision.
