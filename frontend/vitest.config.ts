import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        globals: true,
        include: ['src/app/**/*.test.{ts,tsx,js,jsx}'],
    },
});
