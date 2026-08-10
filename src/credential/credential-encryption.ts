import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;

export interface EncryptedPayload {
  iv: string;
  ciphertext: string;
  authTag: string;
}

/**
 * Derive a per-credential AES-256 key from the master `CREDENTIAL_ENCRYPTION_KEY`
 * via HKDF-SHA256, using the credential ID as salt. This means no per-credential
 * key material needs to be stored — the key is always re-derivable from the
 * master secret plus the credential ID already on the row.
 */
function deriveKey(masterKeyHex: string, credentialId: string): Buffer {
  const masterKey = Buffer.from(masterKeyHex, 'hex');
  return Buffer.from(
    hkdfSync('sha256', masterKey, Buffer.alloc(0), Buffer.from(credentialId, 'utf8'), 32),
  );
}

/**
 * Encrypt `plaintext` with AES-256-GCM under a key derived from `credentialId`,
 * so the payload pinned to IPFS (a public, content-addressed store) isn't
 * readable by anyone who has the CID but not the server's master key.
 */
export function encryptCredentialPayload(
  masterKeyHex: string,
  credentialId: string,
  plaintext: string,
): EncryptedPayload {
  const key = deriveKey(masterKeyHex, credentialId);
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

/**
 * Reverse of {@link encryptCredentialPayload}. Throws if `authTag` doesn't
 * match (tampered or wrong-key ciphertext).
 */
export function decryptCredentialPayload(
  masterKeyHex: string,
  credentialId: string,
  payload: EncryptedPayload,
): string {
  const key = deriveKey(masterKeyHex, credentialId);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]);

  return plaintext.toString('utf8');
}
