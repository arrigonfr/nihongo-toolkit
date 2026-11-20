import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../frontend", import.meta.url));
const server = await createServer({
  root, define: {
    "import.meta.env.VITE_TURNSTILE_SITE_KEY": JSON.stringify("browser-test"),
    "import.meta.env.VITE_CONTACT_SUPPORT_EMAIL": JSON.stringify("support@example.test")
  },
  server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false, watch: null }
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.route("https://challenges.cloudflare.com/turnstile/v0/api.js?*", (route) => route.fulfill({
    contentType: "text/javascript",
    body: "window.turnstile={render(target,options){window.contactTestVerification=options;document.querySelector(target).innerHTML='<input type=\"hidden\" name=\"cf-turnstile-response\" value=\"first-token\">';options.callback('test-token');return 'widget';},reset(){document.querySelector('[name=\"cf-turnstile-response\"]').value='new-token';window.contactTestVerification.callback('new-token');}};"
  }));
  const requests = [];
  let fail = true;
  await page.route("**/api/contact", async (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    await route.fulfill({ status: fail ? 503 : 202, contentType: "application/json", body: JSON.stringify(fail ? { error: "Unavailable" } : { id: body.id, status: "received" }) });
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/contact`);
  await page.locator('#contactSend:not([disabled])').waitFor();
  assert.equal(await page.locator("header .navigation, header .study-appearance, header .study-support").count(), 3);
  assert.equal(await page.locator('select[name="subject"] option').count(), 6);
  await page.locator("#contactSend").click();
  assert.equal(requests.length, 0);
  await page.locator('[name="name"]').fill("Test Visitor");
  await page.locator('[name="email"]').fill("visitor@example.test");
  await page.locator('[name="subject"]').selectOption("General Bug Report");
  await page.locator('[name="message"]').fill("Something needs fixing.");
  await page.locator("#contactSend").click();
  await page.waitForFunction(() => document.querySelector("#contactStatus").textContent.includes("could not accept"));
  assert.equal(await page.locator('[name="message"]').inputValue(), "Something needs fixing.");
  fail = false;
  await page.locator("#contactSend").click();
  await page.waitForFunction(() => document.querySelector("#contactSuccess").open);
  assert.match(await page.locator("#contactReference").textContent(), /^[0-9a-f-]{36}$/);
  assert.equal(await page.locator("#contactSupportEmail").textContent(), "support@example.test");
  assert.equal(await page.locator("#contactSpamTip").isHidden(), true);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].id, requests[1].id);
  assert.equal(await page.locator('[name="message"]').inputValue(), "");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.keyboard.press("Escape");
  assert.equal(await page.evaluate(() => document.querySelector("#contactSuccess").open), false);
  assert.match(await page.locator("#contactStatus").textContent(), /Message received/);
  console.log("Contact form browser checks passed.");
} finally {
  await browser?.close();
  await server.close();
}
