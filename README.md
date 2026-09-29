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
| `SUPABASE_SECRET_KEY` | Secret key, server-side only: processing inbound messages, the internal usage ledger and the demo seed. Never expose it to the browser |
| `OPENAI_API_KEY` | Optional, server-side only: reading customers' messages. Without it, messages are stored and go to the owner unread. Never expose it to the browser |
| `OPENAI_MESSAGE_MODEL` | Optional. The model for reading messages, default `gpt-5.6-luna` |
| `OPENAI_MESSAGE_REASONING_EFFORT` | Optional. `none`, `minimal`, `low` (default) or `medium` |
| `PINGFLOW_MESSAGE_INTERPRETER` | Development only. `fixture` reads the sample messages without calling OpenAI; ignored in production |
| `WHATSAPP_VERIFY_TOKEN` | Optional, server-side only: the webhook's subscription handshake. Any long random string, also entered in Meta's App Dashboard |
| `META_APP_SECRET` | Optional, server-side only: the Meta app's App Secret. Every webhook POST is checked against it |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID` | Optional, server-side only: the developer connection (one test or business number) |
| `WHATSAPP_WORKER_SECRET` | Optional, server-side only: authorises the scheduled worker route |
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

## Messages

Every message goes through one function, `processInboundMessage` in `src/features/messages/pipeline.ts`, whether it came from WhatsApp (see [WhatsApp](#whatsapp)) or the development simulator:

1. Store the message once, by its external ID. A repeated delivery returns the earlier result and changes nothing.
2. Claim it. Messages in one conversation are handled one at a time, oldest first; other conversations aren't held up.
3. Interpret it (outside any transaction). The interpreter only reads the words: intent, dates and times as said, who and which booking.
4. Record the call's usage.
5. Decide, in plain code (`src/domain/messages/policy.ts`): identity, dates, the real schedule, Automations settings and the safety rules. The model never decides availability or changes a booking.
6. Apply the decision in one transaction: a reply, an approval or a message for the owner, the clarifying-question state, and Activity.

If the message can't be read (no key, timeout, refusal, bad output, or any unexpected error), it's kept, nothing is sent, and it goes to Attention as "Pingflow couldn't understand this message". It can be reprocessed; a retry replaces what the failed attempt raised.

Interpreters (`src/lib/ai/config.ts` picks one):

- **OpenAI**, when `OPENAI_API_KEY` is set: the Responses API with a strict JSON schema (`src/domain/messages/interpretation.ts`), `store: false`, an 8 second timeout and at most one retry of a temporary failure. The output is validated again before use. The prompt is `src/lib/ai/prompts/message-interpreter.ts`; it gets first names only, never phone numbers or bookings.
- **Fixture**, with `PINGFLOW_MESSAGE_INTERPRETER=fixture` in development: knows the evaluation corpus and nothing else. Results say "fixture"; it never poses as OpenAI.
- **None** otherwise: every message goes to the owner unread.

### Message simulator

In `pnpm dev`, `/app/dev/messages` sends a pretend WhatsApp message from any of your contacts (or another number) through the real pipeline for your business, and shows what happened: identity, interpretation, decision, reply, usage and cost. It lists recent runs and can reprocess failed ones. It isn't in the navigation, and outside development it doesn't exist: the proxy answers 404, and the page and its actions check again.

### Cost tracking

Each model call writes one row to the usage ledger with the tokens the API reported (input, cached input, output), the model, the response ID, the prompt version and an estimated cost. Prices live in one place, `src/lib/ai/pricing.ts`: `gpt-5.6-luna` is $0.20 per million input tokens, $0.02 cached and $1.20 output. Costs are whole millionths of a dollar, worked out in integers, so a typical message records about $0.0002 rather than $0.00. A model with no listed price is recorded with no cost rather than a guessed one.

### Evaluations

`src/domain/messages/fixtures/` holds 41 realistic messages with the interpretation and outcome each should get. `pnpm test` runs them all through the policy with the expected interpretations, offline and at no cost. Neither `pnpm test` nor the end-to-end tests ever call OpenAI; they pass without a key.

Two opt-in commands use the real API. They cost money, need `OPENAI_API_KEY` in `.env.local`, and say what they will send before sending it:

- `pnpm ai:eval` sends all 41 corpus messages (`--limit 20` for fewer) and judges each reading by what Pingflow would then do: intent, dates, times, person, service, clarification, outcome and structured-output validity, with each miss rated critical, important or minor. It counts every API request, stops rather than exceed one retry per message, and reports latency, tokens, cache hits and cost. Results are saved to `results/ai-evals/` (git-ignored) as JSON: the synthetic messages, readings and totals, never keys. It writes nothing to the database.
- `pnpm ai:smoke` sends five messages (next booking, availability, reschedule, an unclear one and a cancellation) through the whole pipeline into a fresh local demo business, `ai-smoke@pingflow.test`, and checks the replies, Attention, that no booking changed, and the usage ledger.

## WhatsApp

Pingflow talks to customers through the WhatsApp Cloud API (Graph API v26.0, pinned in `src/lib/whatsapp/config.ts`). It's a channel around the message pipeline, not a second one:

```
Meta webhook → signature check → whatsapp_events (inbox) → worker
  → processInboundMessage (the same pipeline as the simulator)
  → outbound message, created where it always was → message_deliveries (outbox)
  → worker → send policy → WhatsApp Cloud API → status webhooks → delivered, read, failed
```

- **Webhook**, `/api/webhooks/whatsapp`. `GET` answers Meta's subscription handshake (`hub.mode`, `hub.verify_token`, `hub.challenge`). `POST` checks `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with `META_APP_SECRET`) before parsing anything, stores each event once by its message or status ID, and answers straight away. Meta retries for up to 36 hours; a repeat is stored once.
- **Routing** is by Meta's phone number ID to the business's connection, never by the customer's number. Events for an unknown number are kept as unroutable; a disconnected business's messages are ignored.
- **Inbound.** Text goes through the pipeline exactly as before. Photos, voice notes, documents, locations and the like are stored and go to the owner in Attention without calling the model; reactions and stickers are recorded and left alone. A customer's messages are handled one at a time, oldest first.
- **Outbound.** Replies, confirmations and reminders are still created in the same transaction as the change they report. If the business is connected and the conversation came in on WhatsApp, the message is queued; a development-simulator conversation is never sent to a real number. The worker sends after the transaction, so a slow or failing WhatsApp never holds up or rolls back a booking change.
- **Send policy** (`src/domain/channel/send-policy.ts`). Within 24 hours of the customer's last message, text is sent. After that only an approved template: confirmations and reminders use one if configured; replies don't have one, so the owner is told to reply in WhatsApp. Nothing is marked sent that wasn't.
- **Reliability.** A message WhatsApp accepted is never sent again. Temporary failures (rate limits, WhatsApp unavailable, a connection that never opened) are retried with backoff, at most five attempts. Refusals aren't retried. A send that stopped mid-way can't be checked with WhatsApp, so it's reported to the owner rather than repeated. Refused credentials put the connection in "needs attention" in Settings.
- **Statuses** only move forward (accepted, sent, delivered, read), however late or often they arrive; a failure never overrides delivered or read.
- **Usage.** One ledger row per message WhatsApp accepts (`provider: meta`, `send_text` or `send_template`, destination country), updated with WhatsApp's own billable flag and pricing category when statuses arrive. No cost is estimated: there's no maintained rate card, and inbound messages aren't charged by Meta.
- **Read receipts** aren't sent: on a number shared with the WhatsApp Business app they would clear the owner's unread badges.

### The worker

`runWhatsAppWork` (`src/features/whatsapp/worker.ts`) processes stored events, turns due reminders into messages and sends what's queued. Every step claims its work in the database, so any number can run at once. It runs:

- after each webhook and each owner approval or reply, once the response has gone (Next.js `after`);
- on a schedule: call `GET /api/internal/whatsapp/work` with `Authorization: Bearer $WHATSAPP_WORKER_SECRET` every minute or so (for example a cron job). This is the guarantee; the other two are the fast path;
- by hand: `pnpm whatsapp work` (add `--loop` to keep going).

### Setting up a developer connection

This is for building and testing with one number. It is not customer onboarding (see below).

1. In the [Meta App Dashboard](https://developers.facebook.com/apps), create a Business app and add the WhatsApp product. API Setup gives a test business number (or add your own), its phone number ID and the WhatsApp Business account ID. Add your own phone as a test recipient.
2. Create a system user access token with `whatsapp_business_messaging` and `whatsapp_business_management` (the temporary API Setup token lasts 24 hours). Put the IDs, the token, the App Secret (App settings → Basic), a verify token of your choosing and a worker secret in `.env.local`.
3. Expose the app over HTTPS. Meta can't reach `localhost`, so use any tunnel (Cloudflare Tunnel, ngrok, …) or a deployed preview. Nothing in the app depends on the tunnel.
4. In WhatsApp → Configuration, set the callback URL to `https://<your host>/api/webhooks/whatsapp` and the verify token, then subscribe to the `messages` field.
5. Connect the number to your Pingflow account: `pnpm whatsapp connect you@example.com`. It checks the token with WhatsApp first. Settings then shows it as connected.
6. To be recognised as a customer, add your phone as a customer's number (or send from a number you've added), then message the business number. Messages from other numbers are treated as unknown.
7. For reminders and confirmations after 24 hours, create utility templates in WhatsApp Manager, register them (`pnpm whatsapp template you@example.com appointment_reminder <name> en_GB customer_first_name,when`) and check their review status (`pnpm whatsapp templates-sync you@example.com`). Only approved templates are sent. The fields a template can use are in `src/domain/channel/templates.ts`.

Without a tunnel, `pnpm whatsapp simulate you@example.com "When's my next lesson?"` posts a correctly signed, Meta-shaped webhook to your local app. In development, `/app/dev/whatsapp` shows the connection's IDs, recent events, the outbox and templates (never tokens), and can run the worker.

### Customers' own numbers

The product promise is that a business keeps its existing WhatsApp Business number. Meta supports that ("coexistence": the WhatsApp Business app and the Cloud API on one number), but only through Embedded Signup run by a Meta Tech Provider with App Review approval. Pingflow doesn't have that yet, so:

- the connection model, states and Settings are built for it (`whatsapp_connections.mode = 'embedded_signup'`);
- the Embedded Signup flow, the token exchange and encrypted per-business token storage are not built. Credentials come through `WhatsAppCredentialProvider` (`src/lib/whatsapp/credentials.ts`); today its only source is the developer connection's environment. Customers' tokens will need server-only encrypted storage (for example Supabase Vault) behind the same interface;
- onboarding still offers "Skip for now", and Settings says connecting isn't available yet.

## Usage ledger

`usage_events` is an internal record of what each business costs Pingflow: model calls (tokens, model, request ID), WhatsApp messages (category, destination, billable) and emails, with an estimated cost in millionths of a currency unit. The message pipeline records its model calls and the WhatsApp channel its sends; email will once it exists.

- Record through `src/lib/usage/record.ts` (`recordAiUsage`, `recordMessagingUsage`), or `writeUsage` with the server's client, server-side only. It uses the secret key, so `SUPABASE_SECRET_KEY` must be set on the server.
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
pnpm test               # unit tests (availability, time, messages, onboarding, services, retries, usage)
pnpm build
pnpm test:e2e           # needs the local stack; starts the app on :3100 if it isn't running
```

The end-to-end tests run Sarah's reschedule, the owner's answers to processed messages and the WhatsApp Settings and Attention states in Chromium and WebKit. The database tests (`e2e/database/`) check row level security, the message pipeline (flows, repeated deliveries, retries, ordering, privacy, usage), the WhatsApp channel (signed webhooks through to sends and statuses, the 24-hour window, templates, reminders, retries, crash recovery, isolation), the customer-and-booking and services transactions, the booking guard, schedule modes and the usage ledger directly against the local database. None of them call OpenAI or Meta. Install the browsers once with `pnpm exec playwright install chromium webkit`.

## Code layout

- `src/domain/`: plain TypeScript rules with no I/O. The availability engine, time zones and formatting, the message policy (`messages/`: interpretation schema, dates, identity, replies, decisions), request planning, message templates, reminder policy, onboarding checks, what each line of work starts with (`onboarding/business-types.ts`), usage events and activity wording.
- `src/lib/ai/`: the interpreters, their configuration, the prompt and model prices. Server-side only.
- `src/features/messages/`: the inbound message pipeline and the development simulator.
- `src/domain/channel/`: channel rules with no provider in them: the 24-hour window, the send policy, template fields, delivery wording.
- `src/lib/whatsapp/`, `src/lib/messaging/`: the WhatsApp Cloud API (transport, webhook parsing and signatures, errors, credentials). Server-side only.
- `src/features/whatsapp/`: the webhook ingestion, the worker and dispatcher, and Settings.
- `src/features/<area>/`: data loading (`data.ts`), server actions (`actions.ts`) and the components for each app area.
- `src/lib/supabase/`: separate browser and server clients, plus the session refresh used by `src/proxy.ts`.
- `src/app/(marketing)/`: the public site. `src/app/(auth)/`: sign-in and onboarding. `src/app/app/`: the signed-in app.
