import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [],
    requests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => requests.push(request.url()));
  await mkdir('.data/screenshots', { recursive: true });
  for (const [name, width, height] of [
    ['desktop', 1440, 1000],
    ['mobile', 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto((process.env.PREVIEW_URL ?? 'http://127.0.0.1:5173') + '/download');
    await page.locator('h1').waitFor();
    assert.equal(await page.locator('a.download-cta').count(), 2);
    for (const link of await page.locator('a.download-cta').all()) {
      assert.equal(await link.getAttribute('href'), '/api/v1/public/launcher/download');
    }
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'Horizontal overflow',
    );
    await page.screenshot({ path: `.data/screenshots/download-${name}.png`, fullPage: true });
  }
  assert.deepEqual(errors, []);
  assert.ok(requests.every((url) => !url.includes('/auth/me') && !url.includes('/settings')));
  console.log(
    'PASS: public download page, desktop/mobile layout, APK links, no admin login or JS errors.',
  );
} finally {
  await browser.close();
}
