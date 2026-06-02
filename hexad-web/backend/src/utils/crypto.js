const crypto = require('crypto');
const CryptoJS = require('crypto-js');
const config = require('../config');

// Session code alphabet (removed confusing chars: 0, O, 1, I)
const SESSION_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Generate random session code (crypto-secure, human-friendly)
const generateSessionCode = (length = 6, alphabet = SESSION_CODE_ALPHABET) => {
    if (!Number.isInteger(length) || length <= 0) {
        throw new Error('length must be a positive integer');
    }
    if (typeof alphabet !== 'string' || alphabet.length < 2) {
        throw new Error('alphabet must be a string with at least 2 characters');
    }

    let code = '';
    for (let i = 0; i < length; i++) {
        code += alphabet[crypto.randomInt(0, alphabet.length)];
    }
    return code;
};

const normalizeSessionCode = (value) => {
    if (value === null || value === undefined) return '';
    return String(value).trim().toUpperCase();
};

const isValidSessionCode = (value, length = 6, alphabet = SESSION_CODE_ALPHABET) => {
    const code = normalizeSessionCode(value);
    if (code.length !== length) return false;

    for (let i = 0; i < code.length; i++) {
        if (!alphabet.includes(code[i])) return false;
    }
    return true;
};

// Generate random token
const generateToken = (bytes = 32) => {
    return crypto.randomBytes(bytes).toString('hex');
};

// Encrypt data (for photos)
const encryptData = (data) => {
    return CryptoJS.AES.encrypt(data, config.encryption.photoKey).toString();
};

// Decrypt data
const decryptData = (encryptedData) => {
    const bytes = CryptoJS.AES.decrypt(encryptedData, config.encryption.photoKey);
    return bytes.toString(CryptoJS.enc.Utf8);
};

// Hash data (non-reversible)
const hashData = (data) => {
    return crypto.createHash('sha256').update(data).digest('hex');
};

module.exports = {
    generateSessionCode,
    SESSION_CODE_ALPHABET,
    normalizeSessionCode,
    isValidSessionCode,
    generateToken,
    encryptData,
    decryptData,
    hashData
};
