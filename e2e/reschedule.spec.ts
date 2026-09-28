import { expect, test } from "@playwright/test";
import { open, seedDemo, signIn } from "./helpers";

// The acceptance test: Sarah asks to move tomorrow's lesson to Friday after
// 4; the owner approves Pingflow's proposal from Attention.
test("approving Sarah's reschedule moves the booking and records everything", async ({
  page,
  baseURL,
}, testInfo) => {
  const email = `e2e-${testInfo.project.name}@pingflow.test`;
  seedDemo(email);

  // 1–3. Sign in with a magic link and land on Attention with Sarah's request.
  await signIn(page, email, baseURL!);
  await expect(page).toHaveURL(/\/app$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Attention" }),
  ).toBeVisible();
  const card = page.getByRole("article").filter({ hasText: "Sarah Khan" });
  await expect(card).toContainText("wants to move");
  await expect(card).toContainText("Friday after 4");
  const approve = card.getByRole("button", { name: /^Approve \w{3} 17:00$/ });
  await expect(approve).toBeVisible();

  // 4. The schedule shows her lesson at its original time.
  const weekGrid = page.locator(".hidden.md\\:block");
  await open(page, "/app/schedule?view=week");
  await expect(
    weekGrid.getByRole("button", { name: /Sarah Khan.*16:00–17:00/ }),
  ).toHaveCount(1);

  // 5–7. Approve: the request leaves Attention.
  await open(page, "/app");
  await approve.click();
  await expect(page.getByRole("status")).toContainText("is now");
  await expect(
    page.getByRole("heading", { name: "You’re all caught up." }),
  ).toBeVisible();
  await expect(
    page.getByRole("article").filter({ hasText: "Sarah Khan" }),
  ).toHaveCount(0);

  // 8. The schedule shows the move (Friday may fall in next week).
  await open(page, "/app/schedule?view=week");
  await expect(
    weekGrid.getByRole("button", { name: /Sarah Khan/ }).first(),
  ).toBeVisible();
  let moved = weekGrid.getByRole("button", {
    name: /Sarah Khan.*17:00–18:00.*moved today/,
  });
  if ((await moved.count()) === 0) {
    await page.getByRole("link", { name: "Next week" }).last().click();
    await expect(page).toHaveURL(/date=/);
    moved = weekGrid.getByRole("button", {
      name: /Sarah Khan.*17:00–18:00.*moved today/,
    });
  }
  await expect(moved).toHaveCount(1);

  // 9. Activity tells the whole story.
  await open(page, "/app/activity");
  const activity = page.locator("main ol");
  for (const line of [
    /Sarah Khan sent a message/,
    /Pingflow understood: move Sarah’s driving lesson/,
    /free and proposed it/,
    /Pingflow asked you to approve/,
    /You approved/,
    /driving lesson moved from .* to .*17:00/,
    /Confirmation to Sarah Khan/,
    /Reminder (set for|moved from)/,
  ]) {
    await expect(activity).toContainText(line);
  }

  // 10. It's all stored: a reload changes nothing.
  await open(page, "/app");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "You’re all caught up." }),
  ).toBeVisible();
});
