const { defineConfig, devices } = require('@playwright/test');

// Target: the live deployed app by default; override with BASE_URL for a branch/preview.
const BASE_URL = process.env.BASE_URL || 'https://trustnetsocial.netlify.app';

module.exports = defineConfig({
  testDir: './tests',
  timeout: 45 * 1000,
  expect: { timeout: 12 * 1000 },
  // Never let a stuck test hang CI forever; retry once to absorb network flakiness.
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',        // full trace saved only when a test retries
    screenshot: 'only-on-failure',  // evidence, automatically
    video: 'retain-on-failure',
    locale: 'he-IL',                // exercise the app the way Israeli users get it
    timezoneId: 'Asia/Jerusalem',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Mobile matters — most beta users are on phones. Same specs, phone viewport.
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  ],
});
