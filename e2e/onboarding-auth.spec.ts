import { expect, type Page, test } from "@playwright/test";
import { adminClient, hasKeys } from "./database/db";
import { open, signIn } from "./helpers";

// Signing in, onboarding to the end with "Skip for now", and where each kind
// of visitor is sent. Regression cover for the onboarding blocker.

const fresh = (tag: string, project: string) =>
  `e2e-${tag}-${project}-${Date.now()}@pingflow.test`;

async function expectPath(page: Page, path: string | RegExp) {
  await expect(page).toHaveURL(
    typeof path === "string"
      ? new RegExp(`${path.replace(/[/?]/g, "\\$&")}$`)
      : path,
  );
}

async function visit(page: Page, path: string) {
  await open(page, path);
  await page.locator("main h1").first().waitFor();
}

async function onboard(
  page: Page,
  {
    type,
    name,
    mode,
  }: { type: string; name?: string; mode: "Regular hours" | "Flexible hours" },
) {
  await page.locator("label", { hasText: type }).click();
  if (name) await page.getByLabel(/Business name/).fill(name);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("heading", { name: "What do customers book?" }),
  ).toBeVisible();
  const services = await page
    .locator("input[id$='-name']")
    .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("heading", { name: "When do you work?" }),
  ).toBeVisible();
  await page.locator("label", { hasText: mode }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("heading", { name: "How should Pingflow help?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Connect WhatsApp" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(
    page.getByRole("heading", { name: "You’re ready." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Go to Attention" }).click();
  await expectPath(page, "/app");
  await expect(
    page.getByRole("heading", { level: 1, name: "Attention" }),
  ).toBeVisible();
  return services;
}

test("signed out: sign-in asks for an email; everything private sends you there", async ({
  page,
}) => {
  await visit(page, "/sign-in");
  await expect(page.getByLabel("Email")).toBeVisible();
  for (const path of ["/start", "/app", "/app/schedule", "/onboarding"]) {
    await visit(page, path);
    await expectPath(page, "/sign-in");
    await expect(page.getByLabel("Email")).toBeVisible();
  }
});

test("a new owner with regular hours signs in, onboards, and stays in the app", async ({
  page,
  baseURL,
}, testInfo) => {
  const email = fresh("regular", testInfo.project.name);
  await signIn(page, email, baseURL!);
  await expectPath(page, "/onboarding");

  // Signed in, onboarding not finished.
  for (const path of ["/sign-in", "/start", "/app", "/app/customers"]) {
    await visit(page, path);
    await expectPath(page, "/onboarding");
  }

  const services = await onboard(page, {
    type: "Dog groomer",
    name: "Paws & Co",
    mode: "Regular hours",
  });
  expect(services).toEqual(["Full groom", "Wash & tidy"]);

  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Attention" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "You’re all caught up." }),
  ).toBeVisible();

  await visit(page, "/app/schedule");
  await expect(
    page.getByRole("heading", { level: 1, name: "Schedule" }),
  ).toBeVisible();
  await expect(page.locator("main header p").first()).toHaveText(
    "Your working hours, bookings and time off.",
  );

  await visit(page, "/app/settings");
  await expect(page.getByLabel("Business name")).toHaveValue("Paws & Co");
  await expect(page.getByLabel("What you do")).toHaveValue("dog_groomer");
  await expect(
    page.getByRole("radio", { name: /Regular hours/ }),
  ).toBeChecked();
  await expect(page.locator("#services input[id$='-name']")).toHaveCount(2);
  // The services section speaks dog grooming, not driving lessons.
  const servicesText = await page.locator("#services").innerText();
  const placeholders = await page
    .locator("#services input[id$='-name']")
    .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).placeholder));
  expect(`${servicesText} ${placeholders.join(" ")}`).not.toMatch(
    /driving|lesson/i,
  );
  expect(placeholders[0]).toBe("e.g. Nail trim");

  // Signed in and set up.
  for (const path of ["/sign-in", "/start", "/onboarding"]) {
    await visit(page, path);
    await expectPath(page, "/app");
  }

  // Signing out ends it: the email form is back, and the app is closed.
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expectPath(page, "/sign-in?signed-out=1");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByText("You’ve signed out.")).toBeVisible();
  // Back doesn't bring the app back: the address may briefly be the app's,
  // but it shows sign-in, with no business data, and settles there.
  await page.goBack();
  await expect(
    page.getByRole("heading", { level: 1, name: "Attention" }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in/);
  // Opening the app directly goes to sign-in. (WebKit can report the
  // redirect as an interrupted navigation; where it ends is what counts.)
  await page.goto("/app").catch(() => {});
  await expectPath(page, "/sign-in");
  await expect(page.getByLabel("Email")).toBeVisible();
});

test("a new owner with flexible hours onboards and keeps flexible hours", async ({
  page,
  baseURL,
}, testInfo) => {
  const email = fresh("flexible", testInfo.project.name);
  await signIn(page, email, baseURL!);
  await expectPath(page, "/onboarding");
  await onboard(page, { type: "Tutor", mode: "Flexible hours" });

  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Attention" }),
  ).toBeVisible();
  await visit(page, "/app/schedule");
  await expect(page.locator("main header p").first()).toContainText(
    "Flexible hours",
  );
  await visit(page, "/app/settings");
  await expect(
    page.getByRole("radio", { name: /Flexible hours/ }),
  ).toBeChecked();
});

test("a session whose account no longer exists is ended cleanly, and the owner can start again", async ({
  page,
  baseURL,
}, testInfo) => {
  test.skip(!hasKeys, "Needs the Supabase keys in .env.local");
  const email = fresh("stale", testInfo.project.name);
  await signIn(page, email, baseURL!);
  await expectPath(page, "/onboarding");

  // As after a local database reset: the account goes, the browser keeps
  // its session.
  const admin = adminClient();
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  await admin.auth.admin.deleteUser(
    data.users.find((u) => u.email === email)!.id,
  );

  await visit(page, "/sign-in");
  await expectPath(page, "/sign-in?error=session");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(
    page.getByText("Your session has ended. Sign in again to carry on."),
  ).toBeVisible();
  const cookies = await page.context().cookies();
  expect(cookies.filter((c) => c.name.startsWith("sb-"))).toEqual([]);

  // Signing in again works, all the way into the app.
  await signIn(page, email, baseURL!);
  await expectPath(page, "/onboarding");
  await onboard(page, { type: "Something else", mode: "Regular hours" });
});
