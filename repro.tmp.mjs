import { chromium } from 'playwright';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  proxy: { server: 'http://127.0.0.1:42801' },
  args: ['--disable-background-networking'],
});
const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await ctx.newPage();
try {
  await page.goto('https://example.com', { timeout: 30000 });
  console.log('example.com OK:', (await page.title()));
} catch (e) { console.log('example.com FAIL:', e.message.split('\n')[0]); }
try {
  await page.goto('https://kesjjang12-sudo.github.io/Healthy/', { timeout: 45000 });
  console.log('healthy OK, title:', await page.title());
} catch (e) { console.log('healthy FAIL:', e.message.split('\n')[0]); }
await browser.close();
