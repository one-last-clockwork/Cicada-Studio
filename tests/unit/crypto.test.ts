import { describe, expect, it } from 'vitest';
import { decryptText, encryptText, tryDecryptText } from '../../src/lib/crypto/browserCrypto';

describe('browser crypto payloads', () => {
  it('decrypts only with the normalized correct phrase', async () => {
    const blob = await encryptText(' Ｃｉｃａｄａ　Key ', '<p>open</p>');
    await expect(decryptText('cicada key', blob)).resolves.toBe('<p>open</p>');
    await expect(tryDecryptText('wrong key', blob)).resolves.toBeNull();
  });
});
