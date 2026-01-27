import crypto from 'crypto';

// Get or generate encryption key from environment
// In production, this should be a securely stored 32-byte key
const ENCRYPTION_KEY = process.env.VAULT_KEY || crypto.randomBytes(32).toString('hex');

// Convert hex key to buffer (must be 32 bytes for AES-256)
function getKeyBuffer() {
  if (ENCRYPTION_KEY.length === 64) {
    // It's a hex string, convert to buffer
    return Buffer.from(ENCRYPTION_KEY, 'hex');
  } else {
    // Derive a key from the string using SHA-256
    return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
  }
}

const KEY = getKeyBuffer();
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypt a plaintext string
 * Returns: iv:authTag:ciphertext (base64 encoded)
 */
export function encrypt(plaintext) {
  if (!plaintext) return null;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

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
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const ciphertext = parts[2];

    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (err) {
    console.error('Decryption error:', err.message);
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
