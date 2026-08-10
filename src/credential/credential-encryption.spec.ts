import { randomBytes } from 'crypto';
import { decryptCredentialPayload, encryptCredentialPayload } from './credential-encryption';

describe('credential-encryption', () => {
  const masterKey = randomBytes(32).toString('hex');

  it('round-trips plaintext through encrypt then decrypt', () => {
    const plaintext = JSON.stringify({ success_rate: 98, jobs: 250 });

    const encrypted = encryptCredentialPayload(masterKey, 'cred-1', plaintext);
    const decrypted = decryptCredentialPayload(masterKey, 'cred-1', encrypted);

    expect(decrypted).toBe(plaintext);
  });

  it('produces ciphertext that does not contain the plaintext', () => {
    const plaintext = JSON.stringify({ success_rate: 98 });
    const encrypted = encryptCredentialPayload(masterKey, 'cred-1', plaintext);

    expect(encrypted.ciphertext).not.toContain('success_rate');
    expect(JSON.stringify(encrypted)).not.toContain('98');
  });

  it('derives a different key per credential ID, so ciphertext differs even with the same plaintext and IV reuse chance', () => {
    const plaintext = JSON.stringify({ success_rate: 98 });
    const a = encryptCredentialPayload(masterKey, 'cred-a', plaintext);
    const b = encryptCredentialPayload(masterKey, 'cred-b', plaintext);

    expect(a.ciphertext).not.toBe(b.ciphertext);
    // Decrypting cred-a's ciphertext under cred-b's derived key must fail
    // (wrong key -> GCM auth tag mismatch), proving key separation.
    expect(() => decryptCredentialPayload(masterKey, 'cred-b', a)).toThrow();
  });

  it('rejects a tampered ciphertext', () => {
    const encrypted = encryptCredentialPayload(masterKey, 'cred-1', 'secret data');
    const tampered = {
      ...encrypted,
      ciphertext: Buffer.from('tampered-bytes-of-wrong-length!').toString('base64'),
    };

    expect(() => decryptCredentialPayload(masterKey, 'cred-1', tampered)).toThrow();
  });

  it('rejects decryption with the wrong master key', () => {
    const encrypted = encryptCredentialPayload(masterKey, 'cred-1', 'secret data');
    const wrongKey = randomBytes(32).toString('hex');

    expect(() => decryptCredentialPayload(wrongKey, 'cred-1', encrypted)).toThrow();
  });
});
