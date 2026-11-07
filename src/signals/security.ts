import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

export interface VerifyMasterSignatureInput {
  rawBody: Buffer;
  timestamp: string;
  nonce: string;
  signature: string;
  secret: string;
  nowMs?: number;
  maxAgeMs: number;
}

function decodeEncryptionKey(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32 || key.toString('base64') !== keyBase64) {
    throw new Error('MASTER_SECRET_ENCRYPTION_KEY must be a canonical base64-encoded 32-byte key');
  }
  return key;
}

export function validateMasterSecretEncryptionKey(keyBase64: string): void {
  decodeEncryptionKey(keyBase64);
}

export function verifyMasterSignature({
  rawBody,
  timestamp,
  nonce,
  signature,
  secret,
  nowMs = Date.now(),
  maxAgeMs,
}: VerifyMasterSignatureInput): boolean {
  if (!/^\d{13}$/.test(timestamp) || !/^[A-Za-z0-9_-]{16,128}$/.test(nonce)) return false;
  if (!/^[a-fA-F0-9]{64}$/.test(signature) || !Number.isFinite(maxAgeMs) || maxAgeMs <= 0) return false;

  const timestampMs = Number(timestamp);
  if (!Number.isSafeInteger(timestampMs) || Math.abs(nowMs - timestampMs) > maxAgeMs) return false;

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${nonce}.`)
    .update(rawBody)
    .digest();
  const provided = Buffer.from(signature, 'hex');

  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export function encryptMasterSecret(secret: string, keyBase64: string, masterExternalId: string): string {
  if (!secret) throw new Error('Master secret must not be empty');

  const key = decodeEncryptionKey(keyBase64);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(masterExternalId, 'utf8'));
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);

  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join(':');
}

export function decryptMasterSecret(envelope: string, keyBase64: string, masterExternalId: string): string {
  const [version, ivBase64, tagBase64, encryptedBase64, ...extra] = envelope.split(':');
  if (version !== 'v1' || !ivBase64 || !tagBase64 || encryptedBase64 === undefined || extra.length > 0) {
    throw new Error('Invalid encrypted Master secret envelope');
  }

  const key = decodeEncryptionKey(keyBase64);
  const iv = Buffer.from(ivBase64, 'base64');
  const tag = Buffer.from(tagBase64, 'base64');
  const encrypted = Buffer.from(encryptedBase64, 'base64');
  if (iv.length !== IV_LENGTH || tag.length !== 16) throw new Error('Invalid encrypted Master secret envelope');

  const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  decipher.setAAD(Buffer.from(masterExternalId, 'utf8'));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}