const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'https://trustnetsocial.netlify.app';
const AUTH_FILE = path.join(__dirname, '.auth', 'session.json');

module.exports = defineConfig({
  testDir: './tests',
  globalSetup: require.resolve('./global-setup.js'),
  timeout: 45 * 1000,
  expect: { timeout: 12 * 1000 },
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: BASE_URL,
    // global-setup GUARANTEES this file exists (real session locally, empty state in CI)
    storageState: AUTH_FILE,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
  },
  projects: [
    {
      name: 'public',
      use: { ...devices['Desktop Chrome'], storageState: { cookies: [], origins: [] } },
      testMatch: /01-public\.spec\.js/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /01-public\.spec\.js/,
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
      testIgnore: /01-public\.spec\.js/,
    },
  ],
});
