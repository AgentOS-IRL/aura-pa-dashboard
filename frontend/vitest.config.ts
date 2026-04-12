import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        globals: true,
        include: ['src/app/{lib,context,settings}/**/*.test.{ts,tsx,js,jsx}'],
    },
});
