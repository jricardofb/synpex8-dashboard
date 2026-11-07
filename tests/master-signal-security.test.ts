import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptMasterSecret, encryptMasterSecret, verifyMasterSignature } from '../src/signals/security.js';

const masterSecret = 'test-master-secret';
const timestamp = '1791734400000';
const nonce = '0123456789abcdef0123456789abcdef';
const encryptionKey = Buffer.alloc(32, 7).toString('base64');

function sign(body: Buffer): string {
  return createHmac('sha256', masterSecret)
    .update(`${timestamp}.${nonce}.`)
    .update(body)
    .digest('hex');
}

describe('Master signal security', () => {
  it('verifies the HMAC over the exact raw body within the timestamp window', () => {
    const rawBody = Buffer.from('{"eventType":"OPEN","eventSeq":1}', 'utf8');

    expect(verifyMasterSignature({
      rawBody,
      timestamp,
      nonce,
      signature: sign(rawBody),
      secret: masterSecret,
      nowMs: Number(timestamp),
      maxAgeMs: 60_000,
    })).toBe(true);
  });

  it('rejects body changes, expired timestamps, and malformed signatures', () => {
    const rawBody = Buffer.from('{"eventType":"OPEN","eventSeq":1}', 'utf8');
    const input = {
      rawBody,
      timestamp,
      nonce,
      signature: sign(rawBody),
      secret: masterSecret,
      nowMs: Number(timestamp),
      maxAgeMs: 60_000,
    };

    expect(verifyMasterSignature({ ...input, rawBody: Buffer.from('{ "eventType":"OPEN","eventSeq":1}', 'utf8') })).toBe(false);
    expect(verifyMasterSignature({ ...input, nowMs: Number(timestamp) + 60_001 })).toBe(false);
    expect(verifyMasterSignature({ ...input, signature: 'not-a-signature' })).toBe(false);
  });

  it('encrypts Master secrets with authenticated encryption bound to the Master id', () => {
    const encrypted = encryptMasterSecret(masterSecret, encryptionKey, 'MASTER-1');

    expect(encrypted).not.toContain(masterSecret);
    expect(decryptMasterSecret(encrypted, encryptionKey, 'MASTER-1')).toBe(masterSecret);
    expect(() => decryptMasterSecret(encrypted, encryptionKey, 'MASTER-2')).toThrow();
  });
});