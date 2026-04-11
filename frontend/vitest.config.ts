import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        globals: true,
        include: [
            'src/app/lib/**/*.test.{ts,tsx,js,jsx}',
            'src/app/context/**/*.test.{ts,tsx,js,jsx}'
        ],
    },
});
