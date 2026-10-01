# Deploying Pingflow for a pilot

The target: the Next.js app on **Vercel**, the database and sign-in on
**Supabase**, a **scheduled call** to the worker every minute, and Meta's
**WhatsApp webhook** pointed at the deployed HTTPS route. Nothing here
needs secrets in the repository; every value below is set in the Vercel
or Supabase dashboard.

## Environment variables

Set these in Vercel (Production). Never prefix a secret with
`NEXT_PUBLIC_`: those are sent to every browser. The server checks this
list when it starts (`src/lib/env.ts`): a missing required variable stops
it with the variable's name in the log; the others log a warning.

| Variable                                   | Needed           | What it's for                                                                       |
| ------------------------------------------ | ---------------- | ----------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                 | yes, at build    | The Supabase project URL. Built into the browser bundle.                            |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`     | yes, at build    | The publishable key. Row level security limits what it can do.                      |
| `SUPABASE_SECRET_KEY`                      | yes              | Server only. Inbound messages, the worker and the usage ledger.                     |
| `OPENAI_API_KEY`                           | for reading      | Without it, messages are stored and go to the owner unread.                         |
| `OPENAI_MESSAGE_MODEL`, `…_REASONING_EFFORT` | no             | Defaults: `gpt-5.6-luna`, `low`.                                                    |
| `WHATSAPP_VERIFY_TOKEN`, `META_APP_SECRET` | for WhatsApp     | The webhook handshake and signature check.                                          |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID` | for WhatsApp | The developer connection: one number per deployment. Use a system user token. |
| `CRON_SECRET`                              | for WhatsApp     | Vercel Cron sends it to the worker. Any long random string.                         |
| `WHATSAPP_WORKER_SECRET`                   | optional         | For calling the worker from anything other than Vercel Cron.                        |

Never set in production: `PINGFLOW_MESSAGE_INTERPRETER`,
`LOCAL_MAIL_INBOX_URL`, `DEMO_OWNER_EMAIL` (development and scripts only).
The server warns if it sees them, or a local Supabase URL.

## Checklist

1. **Create the Supabase project** on a paid plan (daily backups; see
   [Backups](#backups)). Note its URL, publishable key and secret key.
2. **Set the environment variables** above in Vercel.
3. **Run the migrations** from a machine with the repository:
   ```sh
   supabase link --project-ref <project-ref>
   supabase db push            # applies supabase/migrations in order
   supabase migration list     # every migration shows as applied remotely
   ```
4. **Deploy** the app to Vercel (`main`, or the branch you're piloting).
   A production build stops if the two public Supabase values are missing.
5. **Configure sign-in** in Supabase → Authentication:
   - URL configuration: Site URL `https://<domain>`; Redirect URLs
     `https://<domain>/auth/callback`.
   - Email templates: paste `supabase/templates/magic_link.html` into both
     **Magic link** and **Confirm signup**. Its link
     (`{{ .SiteURL }}/auth/callback?token_hash=…`) works on any device.
   - SMTP: set up a custom sender. Supabase's built-in email only reaches
     the project's own team and is heavily rate limited, so pilot owners
     wouldn't get their sign-in links.
6. **Schedule the worker** every minute (reminders, retries, anything the
   webhook didn't finish). With Vercel Cron, add `vercel.json`:
   ```json
   {
     "crons": [{ "path": "/api/internal/whatsapp/work", "schedule": "* * * * *" }]
   }
   ```
   and set `CRON_SECRET`. Check your Vercel plan allows a per-minute
   schedule. Otherwise point any HTTPS scheduler at
   `GET https://<domain>/api/internal/whatsapp/work` with
   `Authorization: Bearer <WHATSAPP_WORKER_SECRET>`. Without a secret, or
   with the wrong one, the route answers 404.
7. **Point Meta's webhook** at the app when WhatsApp is ready: Meta App
   Dashboard → WhatsApp → Configuration → Callback URL
   `https://<domain>/api/webhooks/whatsapp`, Verify token =
   `WHATSAPP_VERIFY_TOKEN`, subscribe to **messages**.
8. **Verify health**: `GET /api/health` → `{"status":"ok"}`;
   `GET /api/health?ready=1` → `{"status":"ok","database":"ok"}` (503 if
   the database doesn't answer within 3 seconds). Point an uptime monitor
   at the second.
9. **Create the pilot business**: the owner signs in at
   `https://<domain>/sign-in` and finishes onboarding. Then, from a
   machine with the repository and the production values in the shell
   (they take precedence over `.env.local`):
   ```sh
   pnpm whatsapp connect owner@example.com --allow-remote
   pnpm whatsapp owner owner@example.com +44… --allow-remote   # owner commands
   pnpm whatsapp template owner@example.com appointment_reminder <name> en_GB customer_first_name,when --allow-remote
   pnpm whatsapp templates-sync owner@example.com --allow-remote
   ```
   `connect` checks the token with Meta once. Templates are only needed
   for reminders and confirmations sent more than 24 hours after the
   customer's last message.
10. **Run the [pilot smoke test](#pilot-smoke-test).**

## Migrations

- Forward only. No migration deletes or rewrites existing data; they add
  tables and columns and replace functions. On a new project they all go
  in together before the first deploy.
- For later changes, push migrations first, then deploy, and keep a
  function's old signature until no deployed version calls it. (Two early
  migrations replaced a function's signature, `set_working_hours` with
  `set_schedule` and `ingest_inbound_message` with a content type: fine
  for a fresh project, but the pattern to avoid once the pilot is live.)
- Before each `db push`, take a copy: `supabase db dump --linked -f
  schema-<date>.sql` and `supabase db dump --linked --data-only -f
  data-<date>.sql`.
- Rolling back the app is safe (Vercel's instant rollback). Rolling back
  the database means a new corrective migration, or restoring a backup.
- After changing the schema locally, regenerate the types:
  `pnpm db:types`.

## Backups

- **Authoritative data is in Supabase Postgres**: businesses, services,
  hours, customers, contacts, bookings, reminders, conversations,
  messages, requests and Activity. Meta keeps its own copy of WhatsApp
  messages; nothing else holds Pingflow's state.
- Use a paid Supabase plan: daily backups are kept for 7 days.
  Point-in-time recovery is an add-on, worth it once the pilot has real
  bookings. The free plan has no backups.
- Restore: Supabase → Database → Backups (replaces the whole database),
  or load a `db dump` with `psql`. Then check `/api/health?ready=1` and
  run the smoke test.

## Never run against production

- `pnpm db:reset`, `supabase db reset --linked`: wipes the database.
- `pnpm db:seed … --allow-remote`: replaces that account's business with
  the demo.
- `pnpm test:e2e`, `pnpm ai:smoke`: they create and replace test
  businesses. (The seed refuses a remote database without
  `--allow-remote`, which stops the tests early.)
- `pnpm whatsapp simulate … --allow-remote`: posts made-up messages.

## Pilot smoke test

On the production URL, with the pilot owner's account and the developer
WhatsApp number. Expect each result before moving on.

1. Sign in with a magic link; finish onboarding; land on Attention.
2. Add a customer with a WhatsApp number you control; book them a
   lesson tomorrow. Schedule shows it; Activity says "booked".
3. From that phone: "When's my next lesson?" → an automatic reply with
   tomorrow's time.
4. "Are you free Friday at 4?" → yes, or up to three real times.
5. "Can we move tomorrow to Friday at 5?" → nothing changes yet; Attention
   shows the move with Friday 17:00.
6. Approve it. The booking moves in Schedule; the phone gets the
   confirmation; Activity shows the request, the approval and the move.
7. From the owner's number: "Who have I got Friday?" → the lesson at
   17:00.
8. Settings → WhatsApp: Connected. Activity shows each message as sent or
   delivered, never more than happened.
9. Reminders: the booking's reminder appears in Activity as set for the
   right time (it's sent by the scheduled worker; outside 24 hours it
   needs an approved template, and Activity says so if not).
