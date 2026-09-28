import { execSync } from "node:child_process";
import type { Page } from "@playwright/test";

const mailpit = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324";

/**
 * Recreates the demo driving instructor for `email` (see
 * scripts/seed-demo.ts). Extra seed options (e.g. "--flexible") can follow
 * the email.
 */
export function seedDemo(emailAndOptions: string) {
  return execSync(`pnpm -s db:seed ${emailAndOptions}`, { encoding: "utf8" });
}

/** The newest sign-in link sent to `email` after `since`, pointed at `baseURL`. */
export async function magicLink(email: string, since: number, baseURL: string) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const search = await fetch(
      `${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
    ).then(
      (r) =>
        r.json() as Promise<{ messages?: { ID: string; Created: string }[] }>,
    );
    const message = search.messages?.find(
      (m) => Date.parse(m.Created) >= since - 2000,
    );
    if (message) {
      const full = await fetch(`${mailpit}/api/v1/message/${message.ID}`).then(
        (r) => r.json() as Promise<{ HTML: string }>,
      );
      const href = /href="([^"]*auth\/callback[^"]*)"/.exec(full.HTML)?.[1];
      if (!href) throw new Error("No sign-in link in the email");
      return href.replace(/&amp;/g, "&").replace(/^https?:\/\/[^/]+/, baseURL);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No sign-in email for ${email}`);
}

export async function signIn(page: Page, email: string, baseURL: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  const since = Date.now();
  await page.getByRole("button", { name: "Send magic link" }).click();
  await page.getByRole("heading", { name: "Check your email" }).waitFor();
  await page.goto(await magicLink(email, since, baseURL));
}

/**
 * page.goto, tolerating one interruption. Attention refreshes itself when a
 * request changes (Realtime); if that refresh lands just as a test opens
 * another page, WebKit reports the load as interrupted. Trying once more
 * gives the page the test asked for.
 */
export async function open(page: Page, path: string) {
  try {
    await page.goto(path);
  } catch (error) {
    if (!/interrupted by another navigation/.test(String(error))) throw error;
    await page.goto(path);
  }
}
