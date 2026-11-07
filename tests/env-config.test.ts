import { afterEach, describe, expect, it } from 'vitest';
import { validateEnv } from '../src/config/env.js';

const ORIGINAL = process.env.DATABASE_URL;

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = ORIGINAL;
  }
});

describe('env configuration', () => {
  it('accepts a Neon-style PostgreSQL URL format without exposing credentials in code', () => {
    const parsed = validateEnv({
      DATABASE_URL: 'postgresql://USER:PASSWORD@HOST:PORT/DB?sslmode=require&channel_binding=require',
      REDIS_URL: 'redis://localhost:6379',
      NODE_ENV: 'test',
    });

    expect(parsed.DATABASE_URL).toContain('postgresql://');
    expect(parsed.DATABASE_URL).toContain('sslmode=require');
  });

  it('throws if DATABASE_URL is missing', () => {
    expect(() => validateEnv({ REDIS_URL: 'redis://localhost:6379', NODE_ENV: 'test' })).toThrow();
  });
});
