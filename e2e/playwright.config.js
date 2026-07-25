const { defineConfig, devices } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'https://trustnetsocial.netlify.app';
const AUTH_FILE = path.join(__dirname, '.auth', 'session.json');
// Authenticated specs read the saved session; if absent they self-skip.
const storageState = fs.existsSync(AUTH_FILE) ? AUTH_FILE : undefined;

module.exports = defineConfig({
  testDir: './tests',
  globalSetup: require.resolve('./global-setup.js'),
  timeout: 45 * 1000,
  expect: { timeout: 12 * 1000 },
  retries: process.env.CI ? 1 : 0,
  // ONE worker: the suite mutates a single shared account; parallel writers would race.
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: BASE_URL,
    storageState,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  ],
});
