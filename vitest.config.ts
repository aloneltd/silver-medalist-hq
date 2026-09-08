import { defineConfig } from 'vitest/config';

// B1's test config — deliberately separate from vite.config.ts (which B3 owns) so a Tailwind
// plugin or app-only alias never has to know tests exist. Covers src/db, src/services,
// src/lib and api/_lib — the modules B1 owns.
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'api/**/*.test.ts'],
    css: false,
  },
});
