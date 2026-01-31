import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// Lazy-loaded key to ensure env vars are loaded first
let cachedKey = null;

function getKey() {
  if (cachedKey) return cachedKey;

  const ENCRYPTION_KEY = process.env.VAULT_KEY;

  if (!ENCRYPTION_KEY) {
    console.error('WARNING: VAULT_KEY not set! Encryption will fail.');
    throw new Error('VAULT_KEY environment variable is required for encryption');
  }

  // Convert hex key to buffer (must be 32 bytes for AES-256)
  if (ENCRYPTION_KEY.length === 64) {
    // It's a hex string, convert to buffer
    cachedKey = Buffer.from(ENCRYPTION_KEY, 'hex');
  } else {
    // Derive a key from the string using SHA-256
    cachedKey = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
  }

  return cachedKey;
}

/**
 * Encrypt a plaintext string
 * Returns: iv:authTag:ciphertext (base64 encoded)
 */
export function encrypt(plaintext) {
  if (!plaintext) return null;

  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  // Combine IV, auth tag, and ciphertext
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Decrypt an encrypted string
 * Input format: iv:authTag:ciphertext (base64 encoded)
 */
export function decrypt(encryptedData) {
  if (!encryptedData) return null;

  try {
    const key = getKey();
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      console.error('Decrypt error: Invalid format, expected 3 parts, got', parts.length);
      return null;
    }

    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const ciphertext = parts[2];

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (err) {
    console.error('Decrypt error:', err.message);
    return null;
  }
}

/**
 * Check if encryption key is properly configured
 */
export function isKeyConfigured() {
  return !!process.env.VAULT_KEY;
}

/**
 * Generate a new random encryption key (for initial setup)
 */
export function generateKey() {
  return crypto.randomBytes(32).toString('hex');
}
