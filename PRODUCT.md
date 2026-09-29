# Pingflow

## Product summary

Pingflow is a WhatsApp-first operations assistant for solo service businesses.

It lets business owners keep using the tool they already rely on — WhatsApp — while Pingflow handles repetitive customer admin behind the scenes.

Pingflow includes its own simple schedule, so an owner does not need another calendar or booking system to get started.

The product is not a generic chatbot and is not intended to replace WhatsApp with another dashboard.

Core idea:

> Keep using WhatsApp. Pingflow handles the admin behind it.

Customers continue messaging the business on its existing WhatsApp Business number.

Pingflow interprets those messages, understands what the customer wants, checks business context such as availability and existing bookings, performs safe routine actions, and asks the owner for approval when judgement is required.

The owner can also control Pingflow through WhatsApp using natural language.

---

# Target user

## Primary MVP user

Solo owner-operated service businesses that:

- rely heavily on WhatsApp for customer communication;
- schedule fixed-time appointments or sessions;
- operate primarily from their phone;
- keep their schedule in their head, in notes, in a paper diary or in a simple phone calendar rather than a booking system;
- repeatedly answer the same booking/admin questions;
- frequently deal with bookings, reschedules, cancellations and reminders;
- do not want another complicated business application.

Examples:

- driving instructors;
- tutors;
- personal trainers;
- cleaners operating scheduled appointments;
- beauty professionals;
- dog groomers;
- photographers;
- similar appointment-based solo service businesses.

## Canonical demo vertical

Driving instructors.

The product is positioned broadly, but the initial product design, demo data and workflow examples should use a driving instructor as the representative business.

This prevents Pingflow becoming vague generic software while keeping the underlying architecture reusable.

## Not currently targeted

Businesses whose primary workflow is:

enquiry → quote → site visit → project/job

Examples include many:

- trades;
- landscapers;
- larger contractors;
- complex project-based businesses.

These may become suitable later but are not the MVP workflow.

---

# Core problem

Many small service-business owners effectively run their business from WhatsApp.

Typical admin includes:

- answering availability questions;
- arranging appointments;
- rescheduling;
- cancellations;
- checking calendars;
- confirming bookings;
- sending reminders;
- answering repeated questions;
- searching old conversations;
- remembering who needs a response;
- manually updating calendars.

This work is repetitive but difficult to automate with traditional software because customer messages are unstructured natural language.

The owner is often:

- driving;
- teaching;
- working with a customer;
- travelling;
- away from a computer.

A new dashboard does not solve the fundamental problem if the owner still has to leave WhatsApp to operate it.

---

# Product promise

Pingflow turns WhatsApp conversations into structured business actions.

The owner keeps:

- their WhatsApp Business number;
- WhatsApp as their primary communication interface;
- their existing way of working.

The owner does not need:

- a separate calendar or booking system to get started;
- to connect any other tool before Pingflow is useful.

Pingflow adds the operational layer behind WhatsApp, including a simple built-in schedule.

Owners who already use Google Calendar will be able to connect it later. It is optional and never required.

---

# Core workflow

Customer message
→ customer/contact identified
→ intent understood
→ relevant business context checked
→ action determined
→ safe action runs OR approval requested
→ system of record updated
→ customer confirmation/follow-up sent
→ action recorded

---

# Product principles

## 1. WhatsApp first

WhatsApp is the primary daily interface.

The web app exists only where a richer interface genuinely helps.

## 2. Keep existing tools

Pingflow should integrate into how the business already works rather than forcing the business to adopt a completely new operational system.

## 3. Almost invisible software

The ideal owner does not spend their day inside Pingflow.

Most routine activity happens automatically or through WhatsApp.

## 4. Human control over consequential actions

Safe repetitive actions may run automatically.

Ambiguous or consequential actions require owner approval.

## 5. AI interprets; deterministic systems execute

AI should understand messy human language.

Normal code should perform important business operations reliably.

## 6. Fail safe

Pingflow never silently guesses when changing a real booking.

When uncertain or when an integration fails, escalate clearly to the owner.

## 7. No workflow-builder complexity

The target customer does not want Zapier.

Pingflow should ask normal business questions and translate those answers into automation rules.

---

# WhatsApp model

## Customer-facing WhatsApp

Pingflow connects to the business's existing WhatsApp Business number.

Customers continue messaging the business exactly as before.

The product should not require customers to:

- install Pingflow;
- use a separate chatbot;
- learn commands;
- change phone numbers.

## Connecting an existing number (Meta's rules, checked September 2026)

- Keeping the existing number and the WhatsApp Business app is Meta's "coexistence" onboarding: the owner keeps using the app (version 2.24.17 or later) while Pingflow uses the Cloud API on the same number. Up to six months of chats and the contacts sync.
- It needs Pingflow to be a Meta Tech Provider using Embedded Signup, with App Review for WhatsApp messaging and management. Until then only a developer number can be connected.
- On a coexistence number WhatsApp turns off group sync, broadcast lists, disappearing and view-once messages and live location, and unlinks the Windows and Wear OS apps. Messages the owner sends from the app stay free; Pingflow's are charged at Meta's rates.
- More than 24 hours after a customer's last message, WhatsApp only allows approved templates. Reminders and late confirmations need one; without it Pingflow says it couldn't send.
- Copy must not promise one-click setup or that nothing changes in the app.

## Owner-facing WhatsApp

The owner can also interact with Pingflow conversationally.

Example commands:

- "Who have I got tomorrow?"
- "When is Sarah booked?"
- "What times am I free Thursday?"
- "Move Sarah to Friday at 4."
- "Cancel Tom tomorrow."
- "Block Friday afternoon."
- "What messages need me?"
- "Remind tomorrow's customers."

These are natural-language intents, not slash commands.

Schedule commands read and update Pingflow's own schedule. The owner should be able to run their day without opening a dashboard.

---

# MVP customer intents

Pingflow should initially understand six customer workflows:

1. Ask for availability
2. Book an appointment
3. Reschedule an appointment
4. Cancel an appointment
5. Ask when their next booking is
6. Ask a simple configured business FAQ

Do not turn the MVP into a general customer-service chatbot.

---

# Proactive MVP workflows

Pingflow should support:

1. Booking confirmation
2. Appointment reminder
3. Cancellation follow-up

Reminder timing is configurable.

Default:

24 hours before the appointment.

---

# Approval model

## Automatic from day one

Safe deterministic workflows such as:

- scheduled reminders;
- confirmations following an approved booking;
- answering "when is my booking?" for a confidently identified customer;
- fixed-template messages using verified booking data.

## Owner approval required initially

- new bookings;
- reschedules;
- cancellations;
- freely generated AI replies;
- unusual requests;
- actions where customer identity is uncertain.

Some of these may become opt-in automatic behaviours later.

## Never automatic

- ambiguous booking changes;
- complaints;
- money disputes;
- uncertain customer identity;
- unknown numbers asking for private booking information;
- actions outside configured business rules.

---

# AI-generated text

AI-written free-form customer messages are drafts in the MVP.

Automatic customer messages should use owner-approved templates populated with checked data.

Pingflow must not impersonate the owner with unconstrained AI-generated responses.

---

# Ambiguity handling

If Pingflow is uncertain:

1. ask one concise clarification when appropriate;
2. if ambiguity remains, escalate to the owner.

Pingflow must never silently choose an interpretation that changes a booking.

---

# Message policy (locked)

How Pingflow handles an inbound message. AI reads the words; deterministic code decides everything else.

- AI only interprets: what the customer wants, dates and times as they said them, and who and which booking they seem to mean. It never decides identity, availability, permissions or approval, and never changes a booking.
- Automatic, only for a customer recognised by their number and only when the matching automation is on: when their next booking is; what's free (up to three real times from the schedule); acknowledging a cancellation request. Fixed templates with checked data.
- Always owner approval: new bookings, reschedules and cancellations. Pingflow proposes a real free time where there is one.
- Unclear: one clarifying question, then the owner.
- Unknown numbers learn nothing private. An availability question from one becomes a draft for the owner.
- A parent or carer linked to several customers names the person, or is asked once.
- Free-form replies are drafts the owner sends.
- A message Pingflow can't read is kept, nothing is sent, and the owner gets it.
- Owners see "Pingflow understood" and "Pingflow isn't sure what they meant", never model details.

---

# Manual takeover

Manual owner activity overrides automation.

If the owner begins handling a customer conversation themselves:

- Pingflow backs off;
- any pending automated conversational flow pauses;
- the owner remains in control.

Automation should never compete with the human owner inside an active conversation.

---

# Booking model

Pingflow owns booking state for MVP.

Pingflow's built-in schedule is the source of truth for bookings. It does not depend on any external calendar.

For MVP:

- working hours define possible availability;
- existing bookings, blocked time and buffers remove availability;
- Pingflow understands appointment duration;
- Pingflow understands a configurable buffer;
- recurring bookings are supported;
- Pingflow records the structured booking/customer state required for reminders and workflows.

Availability = working hours − bookings − blocked time − buffers.

## Regular and flexible hours

Owners choose how they work, in onboarding and later in Settings:

- **Regular hours**: the same weekly pattern. Pingflow only offers times inside it.
- **Flexible hours**: for owners whose availability changes from week to week. Any time is free unless it is booked or blocked. The owner blocks time they can't work.

Flexible hours still respect bookings, blocked time, service length and buffers. As a safety boundary, Pingflow only offers times between 06:00 and 22:00, so "any free time" never means the middle of the night.

Switching to flexible keeps the regular pattern, so switching back restores it.

## Pingflow schedule (MVP scope)

A simple schedule owned by Pingflow. It is operated primarily through WhatsApp (see Owner-facing WhatsApp); the web app shows it when a richer view genuinely helps.

MVP supports:

- day view;
- week view;
- bookings, each attached to a customer;
- available and busy periods;
- working hours;
- recurring bookings;
- a configurable buffer between appointments;
- blocked time;
- reschedules;
- cancellations;
- reminder state for each booking.

Keep it simple. Not in scope:

- team scheduling;
- multiple staff or resources;
- room/resource booking;
- route optimisation;
- marketplace booking;
- complicated calendar permissions;
- enterprise calendar administration;
- Calendly-style booking-page configuration.

## Google Calendar (optional, later)

Google Calendar is an optional integration for owners who already use it.

- It is never required, including during onboarding.
- It is not part of the first release; sync is planned for later.
- Until sync exists, public copy must describe it as planned, never as live.

When sync is built: if a Pingflow-managed booking changes externally in Google Calendar, Pingflow should reconcile the change rather than maintaining contradictory state.

---

# Recurring bookings

Recurring sessions are first-class.

Examples:

- driving lesson every Tuesday at 16:00;
- weekly tutoring;
- weekly PT session.

The system should distinguish:

- changing one occurrence;
- changing the recurring series.

---

# Travel and buffers

MVP supports a simple configurable time buffer between appointments.

Do not build route optimisation initially.

---

# Contact and customer model

Contact and Customer are separate concepts.

## Contact

The person/number messaging the business.

## Customer

The person receiving the service.

These may be different.

Example:

A parent may message and manage appointments for their child.

One contact may potentially manage more than one customer.

---

# Cancellation model

For MVP:

customer requests cancellation
→ Pingflow acknowledges using an approved template
→ cancellation becomes pending
→ owner approves
→ booking is removed/freed
→ activity recorded

Automatic cancellation policies may be configurable later.

---

# Business knowledge

Pingflow supports simple configured FAQs such as:

- pricing;
- areas served;
- service duration;
- cancellation policy;
- what to bring;
- pickup rules;
- basic business information.

Start with structured fields and short answers.

Do not build a large RAG knowledge-base system for MVP.

---

# Admin application

The web application is secondary.

Its purpose is:

- setup;
- configuration;
- exceptions;
- transparency;
- history.

## Navigation

### Attention

Default/home screen.

Answers:

> What actually needs me?

Examples:

- approval needed;
- customer message needs reply;
- Pingflow could not understand something;
- calendar conflict;
- failed reminder;
- integration failure.

Empty state:

> You're all caught up.

### Schedule

Day and week views of bookings, working hours and blocked time.

For when a richer view genuinely helps; everyday schedule changes can still happen through WhatsApp.

### Customers

Simple structured customer/contact records and relevant booking history.

### Activity

Audit trail showing:

- message received;
- interpretation;
- approval;
- booking created/changed;
- reminder sent;
- failure/escalation.

### Automations

Opinionated automation presets.

Examples:

- booking confirmation;
- reminder;
- availability response;
- cancellation acknowledgement.

Users configure or toggle these.

There is no general-purpose workflow builder.

### Settings

- WhatsApp connection;
- calendar sync (optional, later: Google Calendar);
- services;
- appointment durations;
- working hours;
- buffers;
- reminder timing;
- FAQ/business information;
- automation permissions.

---

# Onboarding

The onboarding objective is to make Pingflow usable with minimal configuration.

Target:

approximately five minutes after WhatsApp Business is connected.

Proposed flow:

1. Create account
2. Connect WhatsApp Business
3. Choose business type
4. Configure services and appointment durations
5. Configure working hours
6. Configure buffer between appointments
7. Add or import current bookings, if needed
8. Configure reminders
9. Choose which automations may run automatically
10. Run a sample conversation
11. Go live

Optional, later:

> Already use Google Calendar? Connect it.

Google Calendar must never block onboarding.

Avoid asking users to construct workflows manually.

---

# Failure behaviour

Pingflow fails safe.

Failures should:

- never silently corrupt booking state;
- retry safe operations where appropriate;
- surface failures in Attention when human action is required;
- retain enough context for the owner to understand what happened;
- avoid sending duplicate customer messages.

---

# Landing-page positioning

Primary message:

> Keep using WhatsApp. Pingflow handles the admin behind it.

The page should not lead with:

- AI agents;
- LLMs;
- automation jargon;
- chatbot terminology.

The user benefit should dominate.

---

# Landing-page centrepiece

The primary product demonstration should follow one complete realistic workflow.

Example:

1. Student messages:
   "Can we move tomorrow's lesson?"

2. Pingflow identifies:
   reschedule request.

3. Existing booking is found.

4. Calendar availability is checked.

5. Alternative slot is identified.

6. Owner receives an approval request through WhatsApp.

7. Owner approves.

8. Booking is updated.

9. Student receives confirmation.

10. Reminder is scheduled.

This workflow should be the main product-storytelling and motion opportunity.

It should be considerably more prominent than disconnected feature cards.

---

# Initial CTA

Primary CTA:

Start free

The landing page should therefore behave like a real product rather than a consultancy/waitlist page.

Do not use fake:

- customer counts;
- revenue statistics;
- testimonials;
- logos;
- usage metrics.

Before public launch, Start free must lead into a real onboarding path rather than a dead interaction.

---

# Pricing

Decided (28 September 2026):

- free trial: £0;
- then £10 a month;
- one plan, with everything included.

Not yet defined, so never state them publicly:

- free-trial length;
- VAT treatment;
- cancellation terms;
- whether WhatsApp message charges are passed on or included.

Public copy about WhatsApp costs should say:

> WhatsApp message charges may apply depending on Meta's pricing.

Do not introduce other plans, annual billing, usage limits or a free-forever tier.

---

# MVP non-goals

Explicitly outside MVP:

- payments;
- invoicing;
- full CRM;
- team accounts;
- advanced analytics;
- sales pipeline management;
- general workflow builder;
- voice-call automation;
- Instagram integration;
- Messenger integration;
- native iOS app;
- native Android app;
- large knowledge-base/RAG system;
- sophisticated route optimisation;
- fully autonomous AI agents;
- complex project/job workflows;
- quote-based trade workflows;
- team scheduling or multi-resource calendars;
- Google Calendar sync (optional, planned for later).

---

# Design philosophy

Pingflow should feel:

- effortless;
- calm;
- intelligent;
- trustworthy;
- modern;
- mobile-aware;
- premium;
- operationally credible.

The product should not look like:

- an AI dashboard template;
- a CRM;
- Zapier;
- a chatbot builder;
- an analytics product.

WhatsApp and the customer's actual workflow are the product story.

---

# Success criterion

Pingflow succeeds when a solo service-business owner can spend less time:

- reading repetitive messages;
- checking their calendar;
- typing confirmations;
- typing reminders;
- coordinating reschedules;
- remembering follow-ups;

without fundamentally changing how they run their business.

The ideal user reaction is:

> "I still use WhatsApp exactly like before. I just don't have to do all the admin anymore."