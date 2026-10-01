# Runbook

What to do when something goes wrong in production. Logs are Vercel's
runtime logs; Pingflow's own lines start with `[pingflow]` and carry IDs,
counts and outcomes, never message text, tokens or headers. Commands that
say `--allow-remote` need the production values in the shell (see
[DEPLOYMENT.md](DEPLOYMENT.md#checklist)); none of them prints a secret.

Worth alerting on: `request_error`, `whatsapp.event_error` with
`"final":true`, `whatsapp.connection_needs_attention`,
`usage.not_recorded`, and `/api/health?ready=1` failing.

## WhatsApp token expired

- **Symptom:** Settings → WhatsApp says "WhatsApp needs attention"; sends
  stop; logs show `whatsapp.connection_needs_attention` with an auth
  category.
- **First check:** `pnpm whatsapp status <email> --allow-remote` (status
  and last error); Meta Business Settings → System users (token valid?).
- **Safe action:** generate a new system user token, set
  `WHATSAPP_ACCESS_TOKEN` in Vercel, redeploy, then **Check again** in
  Settings. New replies send normally from then on. Ones refused while the
  token was broken aren't resent: each is in Attention as "Pingflow
  couldn't send …" for the owner to follow up.

## Connection needs attention (other reasons)

- **Symptom:** the same Settings state, with a different category
  (number not registered, permissions, rate limited).
- **First check:** `pnpm whatsapp status … --allow-remote`; the number's
  status in WhatsApp Manager.
- **Safe action:** fix it on Meta's side, then **Check again**. Don't
  disconnect: disconnecting stops routing, and reconnecting needs
  `pnpm whatsapp connect`.

## Webhook signature failures

- **Symptom:** customers' messages don't arrive; logs show
  `whatsapp.webhook_rejected` with `bad_signature`.
- **First check:** `META_APP_SECRET` in Vercel matches the Meta app's
  App Secret (it changes if someone resets it).
- **Safe action:** correct it and redeploy. Meta retries deliveries it
  couldn't make, and duplicates are stored once, so nothing needs
  replaying by hand.

## Worker not running or failing

- **Symptom:** reminders don't go out; "Sending" never becomes "Sent";
  no `whatsapp.work` lines in the logs, or the worker route answering 404
  or 500.
- **First check:** the cron (or scheduler) is configured and firing; its
  secret matches `CRON_SECRET` or `WHATSAPP_WORKER_SECRET`; a 500 has a
  `whatsappScheduledWork failed` line above it.
- **Safe action:** fix the schedule or secret. To catch up now, run
  `pnpm whatsapp work --allow-remote` once. It's safe to run alongside the
  cron: work is claimed, so nothing is sent twice.

## Inbound events that ran out of retries

- **Symptom:** `whatsapp.event_error … "final":true`; `pnpm whatsapp
  status` shows **Events failed** above zero.
- **First check:** the error lines before it (usually the database was
  unavailable for a while).
- **Safe action:** once the cause is fixed, `pnpm whatsapp retry-failed
  <email> --allow-remote`. Events keep their content until stored, and a
  message is never stored twice.

## OpenAI unavailable

- **Symptom:** Attention fills with "Pingflow couldn't understand this
  message"; no automatic replies; logs show `message.failed`.
- **First check:** OpenAI's status page; whether `OPENAI_API_KEY` is valid
  and within its usage limits.
- **Safe action:** nothing is lost or guessed: each message is stored and
  waits in Attention for the owner. New messages are read normally once
  OpenAI is back.

## Reminder or reply not sent

- **Symptom:** Attention shows "Pingflow couldn't send …"; Activity says
  "Reminder not sent: …" with a reason.
- **First check:** the reason. Outside 24 hours a reminder needs an
  approved template (`pnpm whatsapp templates-sync`); "not on WhatsApp"
  means the customer has never messaged this number.
- **Safe action:** the owner contacts the customer directly, then marks
  the item handled. Register or fix the template for next time.

## Database unavailable

- **Symptom:** `/api/health?ready=1` returns 503; pages say "Pingflow
  couldn't load this right now"; the webhook answers 500.
- **First check:** Supabase's status page and the project's dashboard.
- **Safe action:** wait for it. Nothing is half-written: every change is
  one transaction. Meta retries the webhook; the worker picks up where it
  left off. Afterwards, check **Events failed** (above).

## A request won't go away

- **Symptom:** an Attention card can't be approved or declined.
- **First check:** the error shown on the card (the time was taken, the
  booking changed). Reload: a request someone already answered
  disappears.
- **Safe action:** **I'll handle it** closes it and pauses Pingflow for
  that customer; deal with them directly, then resume from their customer
  page. Only as a last resort, close it in SQL:
  `update pending_actions set status = 'dismissed', resolved_at = now(),
  resolution = '{"reason":"operator"}' where id = '<id>';`

## "Pingflow sent the wrong thing"

- **Symptom:** a customer or the owner reports a wrong reply.
- **First check:** the customer's page and Activity: what Pingflow
  understood, what it replied, and why. The run ID in
  `message_processing_runs` has the reading and the decision.
- **Safe action:** the owner replies personally and fixes any booking in
  Schedule; **I'll handle it** pauses automatic replies to that customer.
  If it's a pattern, switch the routine reply off in Automations and
  report the run IDs. Booking changes always waited for the owner, so
  nothing was moved or cancelled by Pingflow alone.
