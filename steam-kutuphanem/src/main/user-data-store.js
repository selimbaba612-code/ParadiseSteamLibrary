'use strict';

/**
 * Kullanici verisi: favoriler ve oyun notlari.
 * Tek bir JSON dosyasinda tutulur, bozuk dosya uygulamayi kilitlemez.
 */

const fs = require('fs/promises');
const path = require('path');

const MAX_NOTE_LENGTH = 500;

function normalizeAppId(appid) {
  const value = String(appid ?? '').trim();
  if (!/^\d+$/.test(value)) throw new Error(`Gecersiz appid: ${appid}`);
  return value;
}

function emptyData() {
  return { version: 1, favorites: [], notes: {} };
}

class UserDataStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = emptyData();
    this.loaded = false;
  }

  async load() {
    if (this.loaded) return this.data;

    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      this.data = {
        version: 1,
        favorites: Array.isArray(parsed.favorites) ? parsed.favorites.map(String) : [],
        notes: parsed.notes && typeof parsed.notes === 'object' ? { ...parsed.notes } : {}
      };
    } catch {
      this.data = emptyData();
    }

    this.loaded = true;
    return this.data;
  }

  async save() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    await fs.writeFile(temporaryPath, JSON.stringify(this.data, null, 2), 'utf8');
    await fs.rename(temporaryPath, this.filePath);
    return this.data;
  }

  async getSnapshot() {
    await this.load();
    return { favorites: [...this.data.favorites], notes: { ...this.data.notes } };
  }

  isFavorite(appid) {
    return this.data.favorites.includes(normalizeAppId(appid));
  }

  async toggleFavorite(appid) {
    const id = normalizeAppId(appid);
    await this.load();

    const index = this.data.favorites.indexOf(id);
    if (index === -1) this.data.favorites.push(id);
    else this.data.favorites.splice(index, 1);

    await this.save();
    return { appid: id, favorite: index === -1 };
  }

  async setNote(appid, note) {
    const id = normalizeAppId(appid);
    await this.load();

    const text = String(note ?? '').trim().slice(0, MAX_NOTE_LENGTH);
    if (text) this.data.notes[id] = text;
    else delete this.data.notes[id];

    await this.save();
    return { appid: id, note: text };
  }

  async getNote(appid) {
    await this.load();
    return this.data.notes[normalizeAppId(appid)] || '';
  }

  async listFavorites() {
    await this.load();
    return [...this.data.favorites];
  }
}

module.exports = { UserDataStore, MAX_NOTE_LENGTH, normalizeAppId };
