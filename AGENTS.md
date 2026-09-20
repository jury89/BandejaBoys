# Contributor instructions

## Required validation

Run `npm run check` before every commit or push. It must complete lint, all tests and the production build without errors. After UI changes, also test the relevant flow at desktop and mobile widths.

## Domain invariants

- Tournaments are independent from ordinary slots/Fanta. Every member can create; only the immutable creator and configured admin manage/publish/draw/advance/cancel. Drafts are private to creator/admin, published pages are member-readable. Registration and partner changes close exactly one hour before start (server time in Rules).
- Fixed chosen tournament pairs require reciprocal consent. Draws are seeded and persisted once. Only current-round scores can change, by the match's players (when enabled), creator or admin, with optimistic revisions. Advancing reads scores transactionally and freezes the previous round; knockout needs a bronze final.
- Tournament Rules changes require `npm run test:rules:tournaments` in addition to the standard check; this tests synthetic resources, never writes production data.

- Fantasy court points are versioned by the match season (`locksAt`), never settlement/current time. Summer keeps 2/3 attendance points; winter uses individual fantasy-score rank 5/3/1/0 with shared ties and skipped occupied places. Do not change manager scoring or the best-mean captain bonus.

- Signup precedence is chronological. Never reorder signups manually in UI code.
- The first four ordered signups are starters; all later signups are reserves.
- Removing a starter promotes the first reserve by derivation, not by a second write.
- A direct substitution keeps the outgoing starter's position and removes an existing reserve entry for the replacement.
- Fixed-seat preferences use `Europe/Rome` half-hour buckets, with at most three users in every overlapping bucket.
- Fixed-seat auto-signup runs only when a slot is created; rescheduling or changing a preference never adds or removes historical signups.
- Fixed-seat auto-signup is limited to the user's preferred venues; empty/absent preferences mean all venues. The three-user overlap cap remains global, not per venue.
- A slot's planned `venueId` is separate from booking facts. Missing legacy ids default to Oasi without migrations; never clear the planned venue when cancelling a booking.
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

This is a single-group, private tool designed to minimize costs and remain within free usage allowances. The owner upgraded production to Firebase Blaze on 2026-09-09 after Spark's daily read quota was exhausted. This does not authorize additional paid services: do not introduce Cloud Functions, new paid infrastructure, analytics or public-discovery features without an explicit product decision.
