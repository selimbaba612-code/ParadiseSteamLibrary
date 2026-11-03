'use strict';

/**
 * Uygulamanin beyni: tarama sonucunu kullanici verisiyle birlestirir,
 * arama ve oyun baslatma isteklerini yonetir. Electron'a bagimli degildir,
 * bu yuzden dogrudan test edilebilir.
 */

const steamScanner = require('./steam-scanner');
const storeApi = require('./store-api');

function toCoverUrl(appid) {
  return storeApi.buildImageUrl(appid);
}

class LibraryService {
  constructor({
    userDataStore,
    scanner = steamScanner,
    store = storeApi,
    steamRoot = null,
    now = () => Date.now()
  } = {}) {
    if (!userDataStore) throw new Error('userDataStore gerekli');

    this.userDataStore = userDataStore;
    this.scanner = scanner;
    this.store = store;
    this.steamRootOverride = steamRoot;
    this.now = now;
    this.cache = null;
  }

  async resolveSteamRoot() {
    if (this.steamRootOverride) return this.steamRootOverride;
    return this.scanner.findSteamRoot();
  }

  async decorate(games, userData) {
    const favorites = new Set(userData.favorites);
    return games.map((game) => {
      const appid = String(game.appid);
      return {
        ...game,
        appid,
        image: toCoverUrl(appid),
        favorite: favorites.has(appid),
        note: userData.notes[appid] || ''
      };
    });
  }

  async scan() {
    const steamRoot = await this.resolveSteamRoot();
    const scanned = await this.scanner.scanSteamLibrary(steamRoot);
    const userData = await this.userDataStore.getSnapshot();
    const games = await this.decorate(scanned.games, userData);

    const state = {
      steamRoot: scanned.steamRoot || null,
      libraries: scanned.libraries || [],
      games,
      favoriteCount: games.filter((game) => game.favorite).length,
      totalSize: games.reduce((total, game) => total + (game.sizeOnDisk || 0), 0),
      scannedAt: this.now()
    };

    this.cache = state;
    return state;
  }

  /** Onbellek varsa onu doner, yoksa tarama yapar. */
  async getState() {
    if (this.cache) return this.cache;
    return this.scan();
  }

  async refresh() {
    this.cache = null;
    return this.scan();
  }

  async toggleFavorite(appid) {
    const result = await this.userDataStore.toggleFavorite(appid);
    if (this.cache) {
      const game = this.cache.games.find((item) => item.appid === String(appid));
      if (game) game.favorite = result.favorite;
      this.cache.favoriteCount = this.cache.games.filter((item) => item.favorite).length;
    }
    return result;
  }

  async setNote(appid, note) {
    const result = await this.userDataStore.setNote(appid, note);
    if (this.cache) {
      const game = this.cache.games.find((item) => item.appid === String(appid));
      if (game) game.note = result.note;
    }
    return result;
  }

  /** Kurulu oyunlarda once yerel arama, sonuc yoksa Steam magazasinda arar. */
  async search(term) {
    const query = String(term ?? '').trim();
    if (!query) return { local: [], store: [] };

    const state = await this.getState();
    const needle = query.toLocaleLowerCase('tr');

    const local = state.games.filter((game) => {
      const name = String(game.name || '').toLocaleLowerCase('tr');
      return name.includes(needle) || game.appid.includes(query);
    });

    const store = await this.store.searchStore(query);
    return { local, store };
  }

  /** Oyunu Steam uzerinden baslatmak icin kullanilacak URI'yi dondurur. */
  async buildLaunchUri(appid) {
    const id = String(appid ?? '').trim();
    if (!/^\d+$/.test(id)) throw new Error(`Gecersiz appid: ${appid}`);
    return `steam://rungameid/${id}`;
  }
}

module.exports = { LibraryService, toCoverUrl };
