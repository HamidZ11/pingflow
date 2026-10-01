# Known limitations

What the MVP deliberately doesn't do, so nobody mistakes a gap for a bug
or a promise. Product scope lives in `PRODUCT.md`; this is the line drawn
for the pilot.

## WhatsApp: what works, and what's parked

Works, and has been proven with a real number:

- A **developer connection**: one WhatsApp number per deployment, set up
  by an operator (`pnpm whatsapp connect`), with credentials from the
  deployment's environment.
- Real inbound messages through Meta's signed webhook, and real replies,
  confirmations and reminders out, within WhatsApp's 24-hour rule (and
  with approved templates outside it).
- The owner's own commands from the number set with `pnpm whatsapp owner`.

Parked, and not part of this build:

- **Self-service onboarding** for customers' own WhatsApp Business
  numbers (Meta's "coexistence"). It needs Pingflow to be a Meta Tech
  Provider with Embedded Signup and App Review, plus encrypted
  per-business token storage. Until then, onboarding offers "Skip for
  now" and Settings says connecting isn't available yet.
- Meta business verification and app publication.

So a pilot runs on a number the operator connects by hand. Each
deployment serves one connected number.

## Not in the MVP

- No payments, invoicing or deposits.
- No teams: one owner per business.
- No channels other than WhatsApp (no SMS, email or Instagram).
- No free-form AI messages sent automatically: automatic replies are
  fixed templates with checked data; anything else is a draft or waits
  for the owner.
- No generic workflow or rule builder: automations are a fixed set of
  on/off switches.
- No route optimisation or travel planning beyond a fixed time after
  each booking.
- No native mobile app: the web app works on phones.
- No Google Calendar sync: Pingflow's own schedule is the source of
  truth (sync is planned, optional, and not built).
- No reporting or analytics dashboards.

## After the MVP

Useful, not needed for the pilot:

- A per-customer message rate guard and a daily OpenAI spend cap (each
  message costs about $0.0002, and retries are already bounded).
- An error-reporting service: today errors go to the deployment's logs
  (`request_error` lines from `src/instrumentation.ts`, the obvious place
  to add one).
- Alerts on the log lines listed in the [runbook](RUNBOOK.md).
- Reprocessing a failed message from the app (development only today).
- A script-level content security policy (needs nonces on every page).
- An explicit size cap on webhook bodies (the platform's request limit
  applies today).
