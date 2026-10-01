# Pingflow

**Keep using WhatsApp. Pingflow handles the admin behind it.**

Pingflow is a WhatsApp-first operations assistant for solo appointment-based
service businesses. Customers can ask about bookings, availability,
reschedules and cancellations through WhatsApp, while Pingflow checks the
real schedule, replies automatically when safe, and sends anything important
to the owner for approval.

It's built for one-person businesses that already run on WhatsApp: driving
instructors, tutors, personal trainers, cleaners, groomers.

## Screenshots

> Screenshots coming soon.

## What it does

- Answers customers on WhatsApp: "When's my next lesson?", "Are you free
  Friday at 4?"
- Checks real bookings, working hours, blocked time and travel time before
  offering any time.
- Turns new bookings, reschedules and cancellations into requests, with a
  free time already proposed.
- Collects everything that needs the owner in one approval queue.
- Keeps its own built-in schedule: bookings, blocks, regular or flexible
  hours.
- Sends booking reminders and confirmations.
- Keeps customer records, including a parent who books for a child.
- Records an Activity timeline of every message, request and change.
- Lets the owner check and change the schedule from WhatsApp.
- Keeps business logic deterministic: the AI reads messages, plain code
  decides.

When a message isn't clear, Pingflow asks one short question. If it's still
unclear, the owner takes it from there.

## Owner commands

The owner can message their business number too:

- "Who have I got tomorrow?"
- "When is Sarah booked?"
- "Am I free at 3?"
- "Move Sarah to Friday at 4"
- "Cancel Sarah's lesson"
- "Block Thursday afternoon"

Only the explicitly configured owner WhatsApp number can use owner commands.

## How it works

```
Customer WhatsApp message
→ Pingflow understands the intent
→ deterministic code checks the real schedule and business state
→ Pingflow replies automatically, or asks the owner to approve
```

> AI interprets language. Deterministic code decides what is true and what
> actions are allowed.

The model never changes a booking, and nothing AI-written is sent to a
customer automatically: replies are fixed templates filled with checked data.

## The app

- **Attention**: requests and messages waiting for the owner.
- **Schedule**: bookings, blocked time, working hours and availability.
- **Customers**: customers, their contacts and booking history.
- **Activity**: a timeline of what Pingflow and the owner did.
- **Automations**: reminders and the routine replies, each on or off.
- **Settings**: business, services, hours, WhatsApp and the owner's number.

## Tech stack

Next.js and TypeScript, Supabase (PostgreSQL), OpenAI, the Meta WhatsApp
Cloud API, and Playwright for end-to-end tests.

## Status

- The MVP is build-complete and covered by unit, database and browser tests.
- Real WhatsApp messages in and out have been proven on a developer
  connection, and owner commands work.
- Customers connecting their own WhatsApp Business number (Meta Embedded
  Signup, Tech Provider, App Review) is intentionally parked.
- A hosted pilot still needs custom SMTP for sign-in emails, the Supabase
  auth URLs and email template set for the production domain, and a
  per-minute worker scheduler.

## Run locally

Needs Node, pnpm and Docker (for local Supabase).

```sh
pnpm install
pnpm db:start            # local Supabase; prints the keys for .env.local
cp .env.example .env.local
pnpm db:reset && pnpm db:seed
pnpm dev                 # http://localhost:3000
pnpm test && pnpm test:e2e
```

`.env.example` explains every variable; OpenAI and WhatsApp are optional
locally. `pnpm whatsapp` connects a developer number and runs the worker (its
commands are listed at the top of `scripts/whatsapp.ts`).

## More

- Deployment: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- Runbook: [docs/RUNBOOK.md](docs/RUNBOOK.md)
- Limitations: [docs/LIMITATIONS.md](docs/LIMITATIONS.md)
- Product scope: [PRODUCT.md](PRODUCT.md)
