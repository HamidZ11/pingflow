// Development tools (the message simulator) exist only under `next dev`.
// A production build inlines NODE_ENV, so there this is always false: the
// proxy answers 404 before anything else runs, and the page and its actions
// check again.
export function devToolsEnabled(): boolean {
  return process.env.NODE_ENV === "development";
}
