import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'r01.spec.mjs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  outputDir: '../../artifacts/playwright-results',
  reporter: [['list'], ['html', { outputFolder: '../../artifacts/playwright-report', open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.R01_BASE_URL || 'https://localhost',
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  }
});
