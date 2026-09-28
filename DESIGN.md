# Pingflow Design Direction

## Purpose

This document defines the visual, interaction and product-presentation direction for Pingflow.

It is the source of truth for:

- landing-page design;
- product UI presentation;
- typography;
- colour;
- spacing;
- component style;
- motion;
- responsive behaviour;
- visual references;
- design constraints.

Implementation agents should read:

1. `PRODUCT.md`
2. `DESIGN.md`

before making product-facing UI decisions.

The goal is not merely to make Pingflow look polished.

The goal is to make the product immediately understandable:

> Keep using WhatsApp. Pingflow handles the admin behind it.

---

# Product personality

Pingflow should feel:

- effortless;
- calm;
- intelligent;
- trustworthy;
- modern;
- precise;
- friendly without being childish;
- premium without feeling corporate;
- operationally credible;
- designed for people who are busy and often on their phone.

It should NOT feel like:

- a generic AI startup;
- an enterprise CRM;
- a chatbot builder;
- a workflow automation platform;
- a developer tool;
- a Zapier clone;
- a template SaaS landing page.

The product should feel simpler than the technology behind it.

---

# Core design principle

## Make the workflow the hero

Do not explain Pingflow primarily through feature lists.

Show:

customer message
→ Pingflow understands it
→ checks context
→ asks for approval when needed
→ performs the action
→ customer receives confirmation

The interface should make this causality obvious.

The strongest visual storytelling should come from realistic product behaviour.

---

# Primary visual references

References are sources of principles, not templates to copy.

## Veeza

Reference:

https://www.veeza.ai/en

Use for:

- premium landing-page composition;
- clear product storytelling;
- generous spacing;
- confident typography;
- restrained product visuals;
- sections that explain a workflow rather than merely listing features;
- strong relationship between copy and product demonstration.

Do not copy:

- exact layouts;
- colour system;
- branding;
- illustration style;
- copy structure word-for-word.

The lesson from Veeza is:

> Explain a complex system in a way that feels extremely simple.

---

## BoardUI

Reference:

https://www.boardui.com

Use for:

- component craft;
- interface density;
- strong small-scale layout;
- list/detail patterns;
- controls;
- panels;
- settings;
- attention states;
- polished product surfaces.

The lesson from BoardUI is:

> Small UI decisions matter.

Product UI should look like something a real software company carefully designed, not placeholder dashboard components.

---

## Shopify / Sidekick-style product presentation

Use for:

- presenting the interface as an object;
- product staging;
- strong framing;
- layering;
- depth;
- editorial composition;
- letting screenshots become visual proof.

Avoid:

- excessive floating cards;
- decorative screenshots that cannot be read;
- fake data visualisations;
- product UI used purely as ornament.

The product should remain legible.

---

# General visual direction

## Canvas

Primary background:

- warm white;
- soft neutral;
- very light grey where section separation is useful.

Avoid pure cold white everywhere if a warmer neutral produces a more considered feel.

Sections should generally be differentiated through:

- spacing;
- typography;
- product composition;
- subtle surface changes;

rather than heavy coloured blocks.

---

# Colour

Primary system:

- near-black text;
- warm white / neutral canvas;
- restrained greys;
- one distinctive accent colour.

The accent should be used deliberately for:

- Pingflow status;
- important interaction;
- workflow progress;
- selected states;
- motion storytelling.

Do not turn the whole site into an accent-colour canvas.

Avoid:

- generic purple AI gradients;
- neon blue SaaS colour palettes;
- glow effects;
- multi-colour gradients;
- rainbow UI;
- colour for decoration without meaning.

Colour should either:

1. communicate state; or
2. create one strong branded visual moment.

---

# Typography

Use one modern UI/sans-serif family unless there is a compelling reason otherwise.

Preferred qualities:

- highly readable;
- clean;
- modern;
- neutral enough for operational software;
- strong at both display and small interface sizes.

Geist is a strong reference.

Typography should create most of the visual hierarchy.

## Headlines

Headlines should be:

- concise;
- high contrast;
- relatively large;
- tightly composed;
- confident.

Avoid:

- enormous text purely for visual impact;
- multiple-line vague AI slogans;
- inflated marketing language.

## Body copy

Body copy should:

- be short;
- use plain English;
- explain a real product behaviour;
- avoid AI jargon.

## UI typography

Product UI should feel compact and deliberate.

Avoid oversized dashboard typography.

---

# Spacing

Spacing should be systematic.

Use generous spacing between major landing-page sections.

Inside product UI:

- density should be higher;
- spacing should feel practical;
- information should stay scannable.

Do not confuse:

marketing spaciousness

with:

application spaciousness.

The landing page can breathe.

The operational UI should be efficient.

---

# Borders and surfaces

Prefer:

- thin borders;
- subtle separators;
- flat or near-flat surfaces;
- restrained radii;
- minimal shadows.

Avoid:

- large blurred shadows;
- glass effects;
- giant floating cards;
- excessive rounded containers;
- a separate card around every piece of content.

Cards should only exist when the information genuinely belongs together.

---

# Radius

Use consistent radii.

Product UI may use:

- medium radius for primary panels;
- smaller radius for controls;
- pill shapes only where semantically appropriate.

Do not make every button, field and label a pill.

---

# Icons

Icons should:

- use one consistent library/style;
- share stroke weight;
- remain secondary to text;
- clarify actions rather than decorate surfaces.

Avoid icon spam.

---

# Landing page architecture

Initial landing-page structure:

1. Header
2. Hero
3. Problem / current workflow
4. How Pingflow works
5. Full WhatsApp workflow demonstration
6. What Pingflow can handle
7. Approval vs automation
8. Existing tools / integrations
9. Who it is for
10. Lightweight admin product preview
11. FAQ
12. Final CTA
13. Footer

This is a starting architecture, not a rigid template.

If a section becomes repetitive or does not materially improve understanding, remove it.

---

# Header

The header should be extremely simple.

Likely contents:

- Pingflow wordmark/logo;
- How it works;
- Product;
- FAQ;
- Sign in;
- Start free.

Do not overcrowd navigation.

The primary CTA should be clear.

---

# Hero

## Goal

Within a few seconds, the visitor should understand:

- Pingflow works with WhatsApp;
- they can keep their current way of working;
- Pingflow handles repetitive booking/admin work.

## Copy direction

Primary positioning:

> Keep using WhatsApp. Pingflow handles the admin behind it.

Supporting copy should explain:

- bookings;
- reschedules;
- reminders;
- calendar updates;
- owner approvals;

without turning into a feature list.

Primary CTA:

> Start free

Secondary CTA may be:

> See how it works

Do not use:

- “Revolutionise your business with AI”
- “AI agents for SMBs”
- “The future of automation”
- “Supercharge productivity”

---

# Hero visual

The hero should demonstrate the product rather than display a generic dashboard screenshot.

Preferred concept:

A realistic WhatsApp conversation becomes a structured Pingflow workflow.

Example:

Customer:

> Can we move tomorrow's lesson to Friday after 4?

Then visually:

- message recognised;
- existing booking found;
- calendar checked;
- free slot identified;
- approval requested;
- owner approves;
- confirmation sent;
- reminder scheduled.

This should feel like one system operating continuously.

The sequence should communicate:

> message → understanding → action

rather than:

> chatbot → response.

---

# Motion direction

Pingflow should use unusually strong motion design where it improves explanation.

Motion is not decoration.

Its job is to explain:

- transformation;
- causality;
- state change;
- direct manipulation;
- workflow progression.

## Motion reference principles

Use the supplied Opus motion direction:

- one continuous element where possible;
- morph size, radius and state;
- cursor-driven interactions;
- real clicks and drags;
- closed-form spring behaviour;
- subtle overshoot;
- short blur when content swaps;
- camera movement only where it improves focus;
- no dead time;
- clear visual rhythm.

Avoid:

- bouncy easing;
- particle bursts;
- glows;
- generic scroll animations;
- elements floating for no reason;
- every section animating independently;
- motion that delays comprehension.

---

# Hero motion sequence

A possible Pingflow hero sequence:

1. WhatsApp message
2. Message expands into interpreted intent
3. Intent becomes booking context
4. Calendar appears
5. Available time highlighted
6. Approval request collapses into WhatsApp
7. Owner taps approve
8. Calendar booking updates
9. Customer confirmation appears
10. Reminder state appears
11. Sequence returns cleanly to the starting state

The sequence should loop seamlessly if looped.

Do not sacrifice readability for spectacle.

---

# Reduced motion

Respect `prefers-reduced-motion`.

Reduced-motion mode should retain:

- hierarchy;
- state changes;
- product understanding;

without large camera movement or unnecessary transforms.

---

# Problem section

Show the current workflow honestly.

Examples:

- WhatsApp messages piling up;
- checking Calendar manually;
- typing confirmations;
- typing reminders;
- losing track of reschedules;
- answering the same questions repeatedly.

Avoid fake pain metrics.

A simple contrast is enough:

Before Pingflow:
messages → memory → calendar → manual reply → reminder later

With Pingflow:
message → Pingflow → action

---

# How Pingflow works

Keep this simple.

Suggested 3-step model:

## 1. Connect

Connect WhatsApp Business. Pingflow's schedule is built in, so no other calendar is needed.

## 2. Pingflow understands

Messages become structured booking/admin requests.

## 3. Pingflow handles it

Safe routines run automatically.
Anything important comes to the owner for approval.

Do not create six or eight onboarding steps in marketing copy.

---

# Product demonstration

This should be the strongest section after the hero.

Use a full realistic story.

Example:

Sarah has a lesson tomorrow at 16:00.

Sarah messages:

> Can we do Friday instead?

Pingflow:

- identifies Sarah;
- finds the existing lesson;
- checks Friday availability;
- proposes 17:00;
- asks owner for approval;
- updates calendar after approval;
- sends confirmation;
- schedules reminder.

Show the whole flow.

Prefer one convincing scenario over ten disconnected feature cards.

---

# WhatsApp presentation

WhatsApp should feel familiar without turning the page into a WhatsApp clone.

Use:

- message bubbles;
- clear timestamps where useful;
- owner/customer distinction;
- realistic conversation language.

Do not copy WhatsApp branding more than necessary.

Pingflow should remain visually its own product.

---

# Approval UX

Approval is a core trust mechanism.

Visually distinguish:

- automatically handled;
- needs approval;
- uncertain;
- completed;
- failed.

Approval requests should be concise.

Example:

Sarah wants to move:

Tue 16:00
→ Fri 17:00

Friday 17:00 is free.

[Approve]
[Other times]
[I'll handle it]

The owner should understand the situation without opening another screen.

---

# Automation presentation

Do not present automations as workflow diagrams by default.

The target user should see simple capabilities such as:

- Booking confirmations
- Appointment reminders
- Availability responses
- Cancellation acknowledgement

Each should be understandable as an on/off capability.

Avoid exposing implementation concepts such as:

- webhook;
- trigger;
- node;
- action graph;
- agent;
- tool call;

unless required in technical/admin context.

---

# Integrations

MVP integrations should be shown honestly.

Primary:

- WhatsApp Business

Google Calendar is an optional sync planned for later. Only ever show it as optional and planned, never as required or live.

Do not create a huge logo cloud suggesting dozens of integrations that do not exist.

Future integrations may be mentioned only if clearly labelled as future/planned.

---

# Who it is for

Position broadly around:

> Solo service businesses that run their day through WhatsApp.

Examples:

- driving instructors;
- tutors;
- personal trainers;
- cleaners;
- groomers;
- beauty professionals;
- photographers.

Do not make the landing page feel like six different vertical-specific products.

Use driving instructors as the strongest running example.

---

# Admin application

The web admin interface is secondary.

It should feel:

- small;
- calm;
- highly focused;
- useful only when needed.

Primary navigation:

1. Attention
2. Schedule
3. Customers
4. Activity
5. Automations
6. Settings

No dashboard homepage.

---

# Attention screen

This is the most important admin screen.

It should answer:

> What needs me?

Possible states:

- approval required;
- unclear request;
- failed reminder;
- calendar conflict;
- unknown customer;
- manual reply required.

Empty state:

> You're all caught up.

Do not fill the empty state with fake analytics.

---

# Customers

Customer records should be practical.

Show only useful operational context:

- name;
- contact;
- next booking;
- recurring schedule;
- recent messages;
- relevant notes;
- booking history.

Avoid turning this into a full CRM.

---

# Activity

Activity should be an audit trail.

Examples:

- message received;
- booking found;
- approval requested;
- owner approved;
- calendar updated;
- confirmation sent;
- reminder scheduled;
- failure escalated.

The owner should be able to understand what Pingflow did.

---

# Automations screen

Use opinionated automation presets.

Examples:

- Booking confirmation
- Tomorrow reminder
- Availability response
- Cancellation acknowledgement

Each should show:

- status;
- short explanation;
- configuration;
- whether approval is required.

Do not introduce a visual workflow builder.

---

# Settings

Settings should use normal business language.

Examples:

- WhatsApp
- Calendar
- Services
- Working hours
- Appointment duration
- Time between appointments
- Reminder timing
- Business information
- Automation permissions

Do not expose technical implementation details.

---

# Mobile behaviour

Pingflow is fundamentally designed for owners who spend much of their day on their phone.

The marketing page and product surfaces must work extremely well on small screens.

Consider:

- thumb reach;
- single-column layouts;
- text wrapping;
- sticky CTA only if clearly useful;
- readable product demonstrations;
- avoiding tiny desktop screenshots;
- collapsing complex product UI into purpose-built mobile compositions.

Do not simply scale desktop UI down.

---

# Responsive product demonstrations

Marketing product visuals may use different composition at narrow widths.

For example:

Desktop:

conversation + calendar + approval side-by-side.

Mobile:

show them sequentially or focus on one state.

The goal is product understanding, not pixel-identical responsive layout.

---

# Interaction states

Every interactive product component should eventually consider:

- default;
- hover;
- focus;
- active;
- disabled;
- loading;
- success;
- failure.

Marketing components should not invent fake interaction if no action exists.

---

# Accessibility

Minimum expectations:

- WCAG AA contrast;
- keyboard-accessible interactions;
- visible focus states;
- semantic HTML;
- correct heading hierarchy;
- meaningful alt text;
- reduced motion;
- adequate touch targets;
- no information communicated solely through colour.

Accessibility should be part of implementation, not a final patch.

---

# Content style

Copy should sound:

- direct;
- calm;
- specific;
- plain-English;
- operational.

Prefer:

> Pingflow checks your calendar and offers a free slot.

Over:

> Our advanced AI scheduling engine intelligently optimises customer interactions.

Prefer:

> You approve important changes.

Over:

> Human-in-the-loop orchestration ensures trust.

---

# Claims

Do not use:

- fake testimonials;
- fake companies;
- fake customer counts;
- fake savings;
- fake time-saved metrics;
- fake awards;
- fake usage figures.

Product demonstrations can use fictional people and businesses if clearly presented as product examples.

---

# UI anti-patterns

Do not use:

- glassmorphism;
- gradient-heavy hero backgrounds;
- purple AI aesthetics;
- floating decorative cards everywhere;
- excessive pills;
- bento-grid overload;
- excessive dashboard metrics;
- meaningless charts;
- giant statistic cards;
- fake live notifications;
- arbitrary blobs;
- random 3D objects;
- stock imagery of smiling business owners;
- icons beside every sentence.

---

# Product-proof rule

Whenever possible:

show the product instead of explaining it.

If a section can be replaced by:

- a realistic message;
- a workflow;
- a real UI state;
- a before/after interaction;

prefer that over an abstract feature card.

---

# Design review order

When reviewing a screen or section, evaluate in this order:

1. Is the information correct?
2. Is the product idea clear?
3. Is the composition correct?
4. Is hierarchy obvious?
5. Is density appropriate?
6. Is typography strong?
7. Is spacing coherent?
8. Are interactions understandable?
9. Does motion help?
10. Only then consider decorative polish.

Do not use polish to hide structural problems.

---

# Implementation review

Implementation is not approval.

A section becomes approved only after:

- rendered review;
- desktop review;
- mobile review;
- interaction review where relevant.

Once approved, do not casually redesign it later.

---

# Landing-page implementation order

Recommended implementation order:

1. Global tokens / typography
2. Header
3. Hero composition
4. Hero product demonstration
5. Hero motion
6. Problem
7. How it works
8. Full workflow story
9. Automation / approval section
10. Integrations
11. Audience
12. Admin preview
13. FAQ
14. CTA
15. Footer
16. Responsive pass
17. Accessibility pass
18. Motion polish
19. Final design critique

Do not build all sections simultaneously before reviewing the hero.

---

# First visual milestone

The first implementation milestone should include only:

- global visual system;
- header;
- hero copy;
- CTA;
- hero product composition;
- initial static version of the WhatsApp → booking workflow.

Do not build the rest of the landing page yet.

The first milestone exists to answer:

> Does Pingflow already feel like the product we want to build?

Only after that is visually approved should the rest of the page inherit its system.

---

# Skill usage

When available:

## product-build-director

Use as the orchestration layer.

It controls:

- scope;
- phase gating;
- agent prompts;
- approval;
- freezing;
- review.

## crafted-frontend-ui

Use during initial implementation for:

- visual quality;
- composition;
- frontend craft.

## Impeccable

Use selectively:

### shape
Before substantial composition work.

### animate
For the hero workflow and meaningful micro-interactions.

### critique
After a rendered implementation exists.

### polish
Only after structural critique issues are resolved.

### adapt / audit
During responsive and accessibility QA.

Do not invoke every skill on every task.

---

# Final quality bar

The landing page should be strong enough that someone sees it and thinks:

> This looks like a real, carefully designed software company.

The product should be understandable without knowing what:

- LLM;
- agent;
- API;
- webhook;
- workflow automation;

means.

The final impression should be:

> Pingflow quietly takes care of the WhatsApp admin I already hate doing.