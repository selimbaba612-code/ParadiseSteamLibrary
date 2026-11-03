'use strict';

/**
 * Yerel hesap sistemi: kullanici adi + sifre.
 * Sifreler duz metin olarak SAKLANMAZ; scrypt ile tuzlanip ozetlenir.
 * Hesaplar yalnizca bu bilgisayarda tutulur (sunucu yok).
 */

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;
const MIN_PASSWORD_LENGTH = 6;
const KEY_LENGTH = 64;

function validateCredentials(username, password) {
  const name = String(username ?? '').trim();
  if (!USERNAME_PATTERN.test(name)) {
    throw new Error('Kullanici adi 3-20 karakter olmali (harf, rakam, alt cizgi)');
  }

  const pass = String(password ?? '');
  if (pass.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Sifre en az ${MIN_PASSWORD_LENGTH} karakter olmali`);
  }

  return { username: name, password: pass };
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, KEY_LENGTH).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(String(password), salt, KEY_LENGTH);
  const expected = Buffer.from(String(hash), 'hex');
  if (expected.length !== candidate.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

class AccountStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.users = {};
    this.loaded = false;
  }

  static key(username) {
    return String(username || '').trim().toLowerCase();
  }

  async load() {
    if (this.loaded) return this.users;

    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      this.users = parsed && typeof parsed.users === 'object' ? parsed.users : {};
    } catch {
      this.users = {};
    }

    this.loaded = true;
    return this.users;
  }

  async save() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    await fs.writeFile(temporary, JSON.stringify({ version: 1, users: this.users }, null, 2), 'utf8');
    await fs.rename(temporary, this.filePath);
  }

  async register(username, password) {
    const credentials = validateCredentials(username, password);
    await this.load();

    const key = AccountStore.key(credentials.username);
    if (this.users[key]) throw new Error('Bu kullanici adi zaten alinmis');

    const { salt, hash } = hashPassword(credentials.password);
    this.users[key] = {
      username: credentials.username,
      salt,
      hash,
      createdAt: new Date().toISOString()
    };

    await this.save();
    return { username: credentials.username };
  }

  async authenticate(username, password) {
    await this.load();

    const key = AccountStore.key(username);
    const user = this.users[key];
    if (!user) throw new Error('Kullanici adi veya sifre hatali');
    if (!verifyPassword(String(password ?? ''), user.salt, user.hash)) {
      throw new Error('Kullanici adi veya sifre hatali');
    }

    return { username: user.username };
  }

  async hasUsers() {
    await this.load();
    return Object.keys(this.users).length > 0;
  }

  async count() {
    await this.load();
    return Object.keys(this.users).length;
  }
}

module.exports = {
  AccountStore,
  validateCredentials,
  hashPassword,
  verifyPassword,
  USERNAME_PATTERN,
  MIN_PASSWORD_LENGTH
};
