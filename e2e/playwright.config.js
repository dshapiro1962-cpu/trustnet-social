const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'https://trustnetsocial.netlify.app';
const AUTH_FILE = path.join(__dirname, '.auth', 'session.json');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 45 * 1000,
  expect: { timeout: 12 * 1000 },
  retries: 0,
  workers: 1,            // one shared mutable account — never parallel writers
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
  },
  projects: [
    // 0) Public-only project: no login, no session file needed. CI uses this.
    {
      name: 'public',
      use: { ...devices['Desktop Chrome'], storageState: { cookies: [], origins: [] } },
      testMatch: /01-public\.spec\.js/,
    },
    // 1) Login happens here, once, BEFORE everything else.
    { name: 'setup', testMatch: /auth\.setup\.js/ },
    // 2) Browser projects depend on setup, so the session file exists by the
    //    time their contexts are created — and is loaded via storageState.
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: AUTH_FILE },
      dependencies: ['setup'],
      testIgnore: [/auth\.setup\.js/, /01-public\.spec\.js/],
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'], storageState: AUTH_FILE },
      dependencies: ['setup'],
      testIgnore: [/auth\.setup\.js/, /01-public\.spec\.js/],
    },
  ],
});
