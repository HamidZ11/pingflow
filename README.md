# Pingflow

Keep using WhatsApp. Pingflow handles the admin behind it.

Product scope and visual direction live in `PRODUCT.md` and `DESIGN.md`.

## Running locally

You need Node 20.12+, pnpm (the version is pinned in `package.json`) and Docker Desktop (for the local Supabase stack).

```sh
pnpm install
pnpm db:start           # local Supabase: Postgres, Auth, Realtime, mail catcher
cp .env.example .env.local
```

`pnpm db:start` prints the local URL and keys. Put them in `.env.local`:

| Variable | What it is |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | API URL, `http://127.0.0.1:54321` locally |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key. Safe in the browser; row level security protects the data |
| `SUPABASE_SECRET_KEY` | Secret key, server-side only: the demo seed, and the internal usage ledger once integrations record to it. Never expose it to the browser |
| `DEMO_OWNER_EMAIL` | The email the demo business is created for |
| `LOCAL_MAIL_INBOX_URL` | Local development only: the mail catcher, `http://127.0.0.1:54324`. Adds an "Open test inbox" link to "Check your email" in `pnpm dev`; never shown in a production build |

Then:

```sh
pnpm db:reset           # apply supabase/migrations to a fresh database
pnpm db:seed            # demo driving instructor for DEMO_OWNER_EMAIL
pnpm dev                # http://localhost:3000
```

Sign in at `/sign-in` with the demo email. Emails don't leave your machine: they land in the local mail catcher at http://127.0.0.1:54324 (the "Open test inbox" link on "Check your email" goes there in development).

`pnpm db:seed you@example.com --flexible` creates the same demo with flexible hours.

## Database

- `supabase/migrations/` holds the schema: tables, row level security, the Attention realtime feed and the functions that change several rows at once (approving a reschedule, creating a customer with their first booking, saving the services list, moving or cancelling a booking, onboarding). Every function runs as the signed-in user, so the same policies apply inside them.
- Bookings and blocked time are re-checked as they're written: a database guard rejects a booking that collides with another booking, its travel time or blocked time, one business at a time. The app's availability engine decides what to offer; the guard makes sure nothing slips through between offering and saving.
- Migrations only move forward: add a new file with a later timestamp rather than editing one that has been applied. Locally, `pnpm exec supabase migration up` applies new files to your existing database; `pnpm db:reset` rebuilds it from scratch (then reseed).
- After changing the schema, run `pnpm db:types` (regenerates `src/lib/supabase/database.types.ts`).
- Studio is at http://127.0.0.1:54323.
- The demo seed is relative to today in Europe/London. Run `pnpm db:seed you@example.com` to create it for any email; it replaces that account's business. It refuses to run against a non-local Supabase unless you pass `--allow-remote`.

## Schedule modes

A business has regular hours (bookable inside its weekly pattern) or flexible hours (bookable any time that's free, between 06:00 and 22:00). The mode is stored on the business (`schedule_mode`); the weekly pattern is kept in flexible mode for switching back. The bookable day for flexible hours is one constant, `FLEXIBLE_BOOKABLE_DAY` in `src/domain/availability/engine.ts`.

## Usage ledger

`usage_events` is an internal record of what each business costs Pingflow: model calls (tokens, model, request ID), WhatsApp messages (category, destination, billable) and emails, with an estimated cost in millionths of a currency unit. It exists so real unit costs can be measured once those integrations are live. Nothing writes to it yet.

- Record through `src/lib/usage/record.ts` (`recordAiUsage`, `recordMessagingUsage`), server-side only. It uses the secret key, so `SUPABASE_SECRET_KEY` must be set on the server once an integration records usage.
- A provider event reported twice (same provider, operation and reference) is stored once.
- Owners can't read or write it, and nothing in the app shows it.

## Failures

Reads from the database are retried briefly when a failure looks temporary (at most twice, within about four seconds); then the screen says "Pingflow couldn't load this right now." with Try again. Writes are never retried automatically; the database functions refuse a repeat of something already done. The policy is in `src/lib/supabase/bounded-fetch.ts`.

## Sign-in links

Sign-in uses one-time email links (no passwords). The email template, `supabase/templates/magic_link.html`, links to `/auth/callback`, which exchanges the token for a session and sends the user on to `/start`:

- signed out: `/sign-in`
- signed in, not set up: `/onboarding`
- set up: `/app`

A session can outlive its account (sessions are signed tokens, checked locally, valid for up to an hour), for example after `pnpm db:reset` deletes local accounts. Before showing onboarding, the app checks the account still exists; if it doesn't, the session is signed out and the sign-in page says "Your session has ended." No need to clear cookies by hand.

For a hosted project, set the Site URL to the app's origin, add `https://<your-domain>/auth/callback` to the allowed redirect URLs, and use the same template for the magic link and confirmation emails.

## Checks

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test               # unit tests (availability, time, onboarding, services, retries, usage)
pnpm build
pnpm test:e2e           # needs the local stack; starts the app on :3100 if it isn't running
```

The end-to-end tests run Sarah's reschedule in Chromium and WebKit. The database tests (`e2e/database/`) check row level security, the customer-and-booking and services transactions, the booking guard, schedule modes and the usage ledger directly against the local database. Install the browsers once with `pnpm exec playwright install chromium webkit`.

## Code layout

- `src/domain/`: plain TypeScript rules with no I/O. The availability engine, time zones and formatting, reschedule planning, message templates, reminder policy, onboarding checks, what each line of work starts with (`onboarding/business-types.ts`), usage events and activity wording.
- `src/features/<area>/`: data loading (`data.ts`), server actions (`actions.ts`) and the components for each app area.
- `src/lib/supabase/`: separate browser and server clients, plus the session refresh used by `src/proxy.ts`.
- `src/app/(marketing)/`: the public site. `src/app/(auth)/`: sign-in and onboarding. `src/app/app/`: the signed-in app.
