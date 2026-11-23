import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests/e2e',testMatch:'chat.spec.ts',workers:1,retries:0,outputDir:'artifacts/playwright-results',reporter:'list',use:{browserName:'chromium',headless:true,trace:'off',launchOptions:{executablePath:process.env.CHATISEN_CHROMIUM_PATH||undefined}}});
