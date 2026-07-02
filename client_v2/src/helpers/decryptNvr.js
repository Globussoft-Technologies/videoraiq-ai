import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY_HEX = import.meta.env.VITE_ENCRYPTION_KEY;
const IV_HEX = import.meta.env.VITE_IV;

const ENCRYPTION_KEY = CryptoJS.enc.Hex.parse(ENCRYPTION_KEY_HEX);
const IV = CryptoJS.enc.Hex.parse(IV_HEX);

export function encrypt(text) {
  if (!text || typeof text !== 'string') return text;
  const encrypted = CryptoJS.AES.encrypt(text, ENCRYPTION_KEY, {
    iv: IV,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  return CryptoJS.enc.Hex.stringify(CryptoJS.enc.Base64.parse(encrypted.toString()));
}

export function decrypt(encryptedText) {
  if (!encryptedText || typeof encryptedText !== 'string' || encryptedText.length === 0) return encryptedText;
  try {
    const encryptedHexStr = CryptoJS.enc.Hex.parse(encryptedText);
    const encryptedBase64Str = CryptoJS.enc.Base64.stringify(encryptedHexStr);
    const decrypted = CryptoJS.AES.decrypt(encryptedBase64Str, ENCRYPTION_KEY, {
      iv: IV,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });
    const result = decrypted.toString(CryptoJS.enc.Utf8);
    return result || encryptedText;
  } catch {
    return encryptedText;
  }
}
