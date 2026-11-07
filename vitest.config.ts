import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    fileParallelism: false, // evita conflito entre testes que usam o mesmo banco
    env: { NODE_ENV: 'test' },
  },
});

