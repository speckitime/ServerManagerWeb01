const CryptoJS = require('crypto-js');
const config = require('../config/app');

const encrypt = (text) => {
  if (!text) return null;
  return CryptoJS.AES.encrypt(text, config.encryption.key).toString();
};

const decrypt = (ciphertext) => {
  if (!ciphertext) return null;
  const bytes = CryptoJS.AES.decrypt(ciphertext, config.encryption.key);
  return bytes.toString(CryptoJS.enc.Utf8);
};

const encryptCredentials = (credentials) => {
  return encrypt(JSON.stringify(credentials));
};

const decryptCredentials = (encrypted) => {
  const decrypted = decrypt(encrypted);
  if (!decrypted) return null;
  return JSON.parse(decrypted);
};

module.exports = { encrypt, decrypt, encryptCredentials, decryptCredentials };
