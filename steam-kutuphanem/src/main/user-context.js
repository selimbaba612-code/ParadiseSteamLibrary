'use strict';

/**
 * Oturum yonetimi: kimin girisli oldugunu tutar ve her kullanici icin
 * ayri favori/not dosyasi + ayri kutuphane onbellegi olusturur.
 */

const path = require('path');
const { LibraryService } = require('./library-service');
const { UserDataStore } = require('./user-data-store');

const GUEST_KEY = '__guest__';

class UserContext {
  constructor({ accounts, dataDir, createService } = {}) {
    if (!accounts) throw new Error('accounts gerekli');
    if (!dataDir) throw new Error('dataDir gerekli');

    this.accounts = accounts;
    this.dataDir = dataDir;
    this.createService = createService || ((userDataStore) => new LibraryService({ userDataStore }));
    this.currentUser = null;
    this.services = new Map();
    this.ready = this.accounts.load();
  }

  dataFilePath(username) {
    if (!username) return path.join(this.dataDir, 'guest.json');
    const safe = String(username).toLowerCase().replace(/[^a-z0-9_]/g, '_');
    return path.join(this.dataDir, `user-${safe}.json`);
  }

  session() {
    return {
      username: this.currentUser,
      guest: !this.currentUser
    };
  }

  async status() {
    await this.ready;
    return {
      ...this.session(),
      userCount: await this.accounts.count()
    };
  }

  startSession(username) {
    this.currentUser = username;
    return this.session();
  }

  async register(username, password) {
    await this.ready;
    const user = await this.accounts.register(username, password);
    return this.startSession(user.username);
  }

  async login(username, password) {
    await this.ready;
    const user = await this.accounts.authenticate(username, password);
    return this.startSession(user.username);
  }

  logout() {
    this.currentUser = null;
    return this.session();
  }

  /** Girisli kullanicinin (yoksa misafirin) kutuphane servisi. */
  service() {
    const key = this.currentUser ? String(this.currentUser).toLowerCase() : GUEST_KEY;
    if (!this.services.has(key)) {
      const store = new UserDataStore(this.dataFilePath(this.currentUser));
      this.services.set(key, this.createService(store));
    }
    return this.services.get(key);
  }

  /** Kullanici degistiginde onbellegi temizlemek icin. */
  resetService(username) {
    const key = username ? String(username).toLowerCase() : GUEST_KEY;
    this.services.delete(key);
  }
}

module.exports = { UserContext, GUEST_KEY };
