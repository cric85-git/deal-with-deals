const { defineConfig } = require('@playwright/test');

// Tests load preview.html via file:// — no http server needed.
module.exports = defineConfig({
  testDir: './tests',
  timeout: 10000,
  use: {
    viewport: { width: 393, height: 852 }, // iPhone 14 Pro CSS
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {})
  }
});
