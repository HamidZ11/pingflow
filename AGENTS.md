<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Pingflow

Read `PRODUCT.md` and `DESIGN.md` before making any product-facing decision. They are the source of truth for scope, claims and visual direction.

## Working rules

- Use pnpm. Checks: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`.
- Visual tokens live in `src/app/globals.css` (`@theme`). Tailwind's default palette, type scale, radii and shadows are cleared on purpose: add a role there rather than reaching for arbitrary colours.
- The hero demo follows one fictional scenario defined in `src/components/reschedule-demo/scenario.ts`. Keep every panel consistent with it.
- Do not add fake metrics, testimonials, logos, pricing or integrations beyond WhatsApp Business.
- Pingflow has its own built-in schedule; it is the booking source of truth. Google Calendar is optional and not built yet: only ever describe it as planned, optional sync — never required, never live.
- Pricing is decided: a free trial, then £10 a month, one plan. Never state a trial length, VAT, cancellation terms, or whether Meta's WhatsApp charges are included. See `PRODUCT.md` → Pricing.
- Implementation is not approval. Do not commit unless asked.
