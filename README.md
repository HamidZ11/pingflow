# Pingflow

**Keep using WhatsApp. Pingflow handles the admin behind it.**

Pingflow is a WhatsApp-first operations assistant for solo,
appointment-based service businesses: driving instructors, tutors,
personal trainers, cleaners, groomers. Customers keep messaging the
business on WhatsApp as they always have. Pingflow reads those messages,
checks them against the business's real schedule, and handles the routine
admin, while anything that changes a booking waits for the owner.

Product scope lives in [`PRODUCT.md`](PRODUCT.md) and visual direction in
[`DESIGN.md`](DESIGN.md). The MVP is build-complete; a hosted pilot needs
three setup steps (see [Production and pilot](#production-and-pilot)).

## What it does

A customer messages things like:

- "When's my next lesson?"
- "Are you free Friday at 4?"
- "Can I move my booking?"
- "I need to cancel."
- "Can I book next week?"

Pingflow works out what they mean, checks who they are and what's really
in the schedule, and then does one of three things:

- **replies automatically** when it's safe: their next booking, or real
  free times;
- **asks one short question** when something's missing ("What day would
  suit you?");
- **sends a request to the owner** to approve: new bookings, moves and
  cancellations, with a real free time already proposed.

The owner can use WhatsApp too. From the number set up as theirs, they can
ask "Who have I got tomorrow?", "When is Sarah booked?" or "Am I free at
3?", and change things: "Move Sarah to Friday at 4", "Cancel Sarah's
lesson", "Block Thursday afternoon". Only that configured owner number can
do this; everyone else is treated as a customer.

### The app

- **Attention**: the requests and messages that need the owner, each with
  what the customer said, what Pingflow suggests and the answers (approve,
  choose another time, decline, or "I'll handle it").
- **Schedule**: day and week views of bookings, blocked time and working
  hours (regular weekly hours, or flexible); adding, moving and cancelling
  bookings; blocking time.
- **Customers**: customers, the contacts who message for them (a parent,
  say), their upcoming and past bookings and recent messages.
- **Activity**: a timeline of everything Pingflow and the owner did:
  messages, requests, approvals, bookings, confirmations, reminders, and
  whether each message was actually sent.
- **Automations**: the routine things Pingflow does on its own, each on or
  off: reminders, confirmations, availability replies, "when is my
  booking?" replies, cancellation acknowledgements.
- **Settings**: the business, services (length and the time needed
  after), working hours, WhatsApp and the owner's number.

## How it decides

**AI interprets language. Deterministic code decides what is true and what
actions are allowed.**

- **The model** (OpenAI's `gpt-5.6-luna`) only reads words: the intent,
  and the dates, times, people, services and bookings as the message put
  them. It returns a strict, validated structure.
- **The application** does everything else: identifies the sender from
  their number, finds the booking, checks availability (working hours,
  minus bookings, blocked time and the time needed between them), applies
  the policy, makes changes in database transactions, writes every
  customer message from fixed templates filled with checked data, and
  schedules reminders.

The model never changes the database, and no AI-written message is ever
sent automatically.

### Customer policy

| Situation                                                                   | What happens                                                         |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| A known customer asks when their next booking is, or what's free            | Automatic reply, if that automation is on                            |
| Confirmations, reminders, acknowledging a cancellation request              | Automatic, from fixed templates, if switched on                      |
| A new booking, a move or a cancellation                                     | Waits for the owner's approval in Attention                          |
| Anything else (questions, complaints, things needing a free-form reply)     | Goes to the owner; any draft is built from checked data, never sent  |
| Not clear                                                                   | One short question; still unclear, it goes to the owner              |
| An unknown number asking about a booking, or a parent not saying which child | Nothing private is shared; it goes to the owner, or asks which child |

A follow-up like "Actually 6 would be better" changes the request that's
still waiting rather than adding another. If the owner moves, cancels or
books something themselves, waiting requests about it close. Every
approval is checked again as it's written, so a time taken in the
meantime is never booked.

## Architecture

**Stack:** Next.js 16 (App Router) with React 19 and TypeScript, Tailwind
CSS 4, Supabase (Postgres with row level security, Auth with email
magic links, Realtime), the OpenAI Responses API with `gpt-5.6-luna`, the
Meta WhatsApp Cloud API (Graph API v26.0), Zod for structured outputs,
Vitest and Playwright for tests.

A customer's message:

```
Customer on WhatsApp
  → Meta webhook (signature checked) → stored once (whatsapp_events)
  → message pipeline: stored once, one at a time per conversation
  → AI interpretation (structure only) → usage recorded
  → deterministic policy: identity, bookings, availability, rules
  → one transaction: reply, request for the owner, or nothing; Activity
  → outbox (message_deliveries) → worker → send policy → WhatsApp
  → delivery statuses → Activity, usage ledger
```

The owner's command:

```
Owner on WhatsApp (their configured number)
  → same webhook and pipeline → owner-command interpreter
  → deterministic schedule and customer rules
  → one transaction: the change (re-checked), the reply → WhatsApp
```

### Code layout

- `src/domain/`: plain TypeScript rules with no I/O: the availability
  engine, dates and times, the customer message policy
  (`messages/policy.ts`), owner commands (`owner/`), request planning,
  message templates, reminders, channel rules (the 24-hour window, the
  send policy) and Activity wording.
- `src/features/<area>/`: data loading, server actions and components for
  each app area; `features/messages/` is the inbound pipeline and
  `features/whatsapp/` the webhook ingestion, worker and dispatcher.
- `src/lib/ai/`: the interpreters, prompts, model settings and prices.
  `src/lib/whatsapp/`: the Cloud API transport, webhook signatures and
  parsing. `src/lib/supabase/`: browser, server and service clients. All
  server-side only, except the browser client.
- `src/app/`: the public site (`(marketing)/`), sign-in and onboarding
  (`(auth)/`), the signed-in app (`app/`) and the API routes (`api/`).
- `supabase/migrations/`: the schema, row level security and the database
  functions that change several rows at once. Functions run with their
  caller's permissions, so row level security applies inside them too; a
  database guard re-checks every booking and block against the schedule as
  it's written.

## Running locally

You need Node 20.9 or later (the scripts use Node's `--env-file` flags, so
a current LTS is simplest), pnpm (pinned in `package.json`) and Docker
Desktop for the local Supabase stack.

```sh
pnpm install
pnpm db:start            # local Supabase: Postgres, Auth, Realtime, mail catcher
cp .env.example .env.local
```

`pnpm db:start` prints the local URL and keys: put them in `.env.local`
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SECRET_KEY`), with `DEMO_OWNER_EMAIL` and, for the "Open test
inbox" link, `LOCAL_MAIL_INBOX_URL=http://127.0.0.1:54324`. `.env.example`
explains every variable; `.env.local` is git-ignored.

- Secrets stay on the server: only `NEXT_PUBLIC_` values reach the
  browser, and in production the server refuses to start if a
  secret-looking variable has that prefix.
- OpenAI is optional: without `OPENAI_API_KEY`, messages are stored and go
  to the owner unread. For the sample messages without a key, set
  `PINGFLOW_MESSAGE_INTERPRETER=fixture` (development only).
- WhatsApp is optional: nothing is needed until you connect a number.

```sh
pnpm db:reset            # apply supabase/migrations to a fresh database
pnpm db:seed             # a demo driving instructor for DEMO_OWNER_EMAIL
pnpm dev                 # http://localhost:3000
```

Sign in at `/sign-in` with the demo email; the link lands in the local
mail catcher (http://127.0.0.1:54324). `pnpm db:seed you@example.com
--flexible` seeds any email, with flexible hours. The seed replaces that
account's business and refuses a non-local database unless you pass
`--allow-remote`.

- **Schema changes:** add a new migration (they only move forward), apply
  it with `pnpm exec supabase migration up` or rebuild with
  `pnpm db:reset`, then run `pnpm db:types`. Studio is at
  http://127.0.0.1:54323.
- **Message simulator:** in `pnpm dev`, `/app/dev/messages` sends a
  pretend WhatsApp message through the real pipeline and shows the
  reading, the decision, the reply and the cost. "You, the owner" sends an
  owner command (the demo's owner number is +44 7700 900001). It returns
  404 outside development.

## Testing

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test                # unit tests: availability, dates, message and owner policies, channel rules, environment
pnpm build
pnpm test:e2e            # database, Chromium and WebKit; starts the app on :3100 if it isn't running
```

Install the browsers once with `pnpm exec playwright install chromium
webkit`. Run the end-to-end tests against the local stack only: they
create and replace test businesses.

- **Database tests** (`e2e/database/`): row level security and isolation
  between businesses, the message pipeline, customer approvals (stale
  times, superseded requests, the owner acting first), owner commands, the
  WhatsApp channel (signed webhooks, the 24-hour window, templates,
  reminders, retries, racing workers), bookings and the usage ledger.
- **Browser tests** (`e2e/*.spec.ts`): the Sarah reschedule story,
  Attention, onboarding and sign-in, Settings, phone widths, and the
  production surface (health, headers, refused calls).

None of them call OpenAI or Meta. Live checks are separate and opt-in,
because they cost money: `pnpm ai:eval` (with `--automation` or `--owner`
for the other corpora) sends the evaluation messages to the real model and
scores each reading by what Pingflow would then do; `pnpm ai:smoke` runs
five messages through the whole pipeline into a local demo business.
Results go to `results/ai-evals/` (git-ignored).

## WhatsApp

Pingflow talks to customers through the WhatsApp Cloud API. It's a channel
around the message pipeline, not a second one.

- **Webhook**, `/api/webhooks/whatsapp`: `GET` answers Meta's handshake;
  `POST` checks `X-Hub-Signature-256` against `META_APP_SECRET` before
  parsing anything, stores each event once and answers straight away.
  Routing is by Meta's phone number ID, never the customer's number.
- **Sending:** replies, confirmations and reminders are created in the
  same transaction as the change they report, then sent by the worker.
  Within 24 hours of the customer's last message, text; after that, only
  an approved template. A message WhatsApp accepted is never sent twice,
  temporary failures are retried (at most five times), and nothing is
  marked sent that wasn't. A conversation from the development simulator
  never reaches a real number.
- **The worker** (`runWhatsAppWork`) processes stored events, sends due
  reminders and what's queued. It runs after each webhook and approval,
  on a schedule (`GET /api/internal/whatsapp/work` with `Authorization:
  Bearer <WHATSAPP_WORKER_SECRET>` or Vercel Cron's `CRON_SECRET`; the
  schedule is the guarantee), or by hand with `pnpm whatsapp work`.

### Connecting a developer number

1. In the Meta App Dashboard, create a Business app with the WhatsApp
   product; note the phone number ID and WhatsApp Business account ID;
   create a system user token (`whatsapp_business_messaging`,
   `whatsapp_business_management`).
2. Put the token, the IDs, the App Secret, a verify token of your choosing
   and a worker secret in `.env.local`.
3. Expose the app over HTTPS (a tunnel or a deployed preview), set the
   callback URL to `https://<host>/api/webhooks/whatsapp` with your verify
   token, and subscribe to `messages`.
4. `pnpm whatsapp connect you@example.com` (it checks the token with Meta
   once). Settings then shows WhatsApp as connected.
5. Owner commands: `pnpm whatsapp owner you@example.com +44…` sets the
   owner's own number (`owner-clear` removes it). With none set, every
   sender is a customer.
6. Templates for messages after 24 hours: create them in WhatsApp
   Manager, then `pnpm whatsapp template you@example.com
   appointment_reminder <name> en_GB customer_first_name,when` and
   `pnpm whatsapp templates-sync you@example.com`.

Without a tunnel, `pnpm whatsapp simulate you@example.com "When's my next
lesson?"` posts a correctly signed, Meta-shaped webhook to your local app.
`pnpm whatsapp status you@example.com` shows the connection and its
queues; `pnpm whatsapp retry-failed you@example.com` requeues inbound
events that ran out of retries. The CLI never prints tokens and only touches a non-local database
with `--allow-remote`.

### What works, and what's parked

- **Works:** a developer connection (one number per deployment, connected
  by an operator), proven with real inbound and outbound messages; owner
  commands from the configured number.
- **Parked:** customers connecting their own WhatsApp Business numbers
  themselves. That needs Meta Embedded Signup, Tech Provider status, App
  Review and publication, plus encrypted per-business token storage; none
  of it is built. Onboarding offers "Skip for now", and Settings says
  connecting isn't available yet.

## Production and pilot

The MVP is build-complete. Running it for a real pilot is documented in
`docs/`:

- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md): environment variables, the
  deployment checklist (Vercel, Supabase, the scheduled worker, Meta's
  webhook), migrations, backups, what never to run against production,
  and the pilot smoke test.
- [`docs/RUNBOOK.md`](docs/RUNBOOK.md): what to check and do when
  WhatsApp, the worker, OpenAI or the database misbehaves.
- [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md): what the MVP doesn't do,
  and what comes after.

A hosted pilot still needs three setup steps, all in the checklist:

1. **Custom SMTP** for Supabase's sign-in emails (the built-in sender only
   reaches the project's own team).
2. **Supabase production auth settings:** the Site URL, the redirect URL
   (`https://<domain>/auth/callback`) and the repository's magic-link
   template (`supabase/templates/magic_link.html`).
3. **A per-minute schedule** for the worker (Vercel Cron with
   `CRON_SECRET`, or any HTTPS scheduler with `WHATSAPP_WORKER_SECRET`).

Built in for production: a startup check that stops the server if a
required variable is missing (naming it, never its value); a health
check at `/api/health` and `/api/health?ready=1`; security headers; logs
with IDs and outcomes only, and server errors with no query strings,
headers, phone numbers or emails.

## MVP limitations

No payments or invoicing, no teams, no channels other than WhatsApp, no
generic workflow builder, no route optimisation, no native app, no
automatically sent AI-written messages, and customers can't yet connect
their own WhatsApp number. The full list, and what comes next, is in
[`docs/LIMITATIONS.md`](docs/LIMITATIONS.md).
