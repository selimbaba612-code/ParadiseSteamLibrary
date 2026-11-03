'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { CHANNELS, registerIpcHandlers } = require('../src/main/ipc');
const { AccountStore } = require('../src/main/accounts');
const { UserContext } = require('../src/main/user-context');
const { LibraryService } = require('../src/main/library-service');

function createFakeIpcMain() {
  const handlers = new Map();
  const duplicates = [];
  return {
    handlers,
    duplicates,
    handle(channel, fn) {
      if (handlers.has(channel)) {
        duplicates.push(channel);
        return;
      }
      handlers.set(channel, fn);
    },
    invoke(channel, ...args) {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`Kanal yok: ${channel}`);
      return handler({ sender: {} }, ...args);
    }
  };
}

function fakeScanner() {
  return {
    findSteamRoot: async () => '/sahte/steam',
    scanSteamLibrary: async (root) => ({
      steamRoot: root,
      libraries: [root],
      games: [
        { appid: 730, name: 'Counter-Strike 2', installed: true, sizeOnDisk: 2048, lastPlayed: 0, libraryPath: root },
        { appid: 400, name: 'Portal', installed: true, sizeOnDisk: 1024, lastPlayed: 0, libraryPath: root }
      ]
    })
  };
}

function fakeCatalog() {
  const calls = [];
  return {
    calls,
    getFeatured: async () => [{ key: 'top_sellers', title: 'En Çok Satanlar', items: [{ appid: 730, name: 'CS2' }] }],
    browse: async (options) => {
      calls.push(options);
      return { page: options.page || 0, items: [{ appid: 570, name: 'Dota 2', free: true }], hasMore: true };
    },
    storeUri: (appid) => `steam://store/${appid}`,
    installUri: (appid) => `steam://install/${appid}`
  };
}

async function setup(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sk-ipc-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  const ipcMain = createFakeIpcMain();
  const accounts = new AccountStore(path.join(dir, 'accounts.json'));
  const opened = [];
  const catalog = fakeCatalog();

  const context = new UserContext({
    accounts,
    dataDir: dir,
    createService: (store) => new LibraryService({
      userDataStore: store,
      scanner: fakeScanner(),
      store: { searchStore: async () => [] }
    })
  });

  registerIpcHandlers({
    ipcMain,
    context,
    catalog,
    launchUri: async (uri) => opened.push(uri),
    getVersion: () => '0.2.0',
    getSteamRoot: async () => '/sahte/steam'
  });

  return { ipcMain, opened, catalog, context, dir };
}

test('butun kanallar kaydedilir (auth + katalog dahil)', async (t) => {
  const { ipcMain } = await setup(t);
  assert.deepEqual([...ipcMain.handlers.keys()].sort(), Object.values(CHANNELS).sort());
  assert.equal(ipcMain.duplicates.length, 0);
  assert.equal(Object.keys(CHANNELS).length, 15);
});

test('kayit ol, cikis yap ve tekrar giris yap', async (t) => {
  const { ipcMain } = await setup(t);

  let status = await ipcMain.invoke(CHANNELS.authStatus);
  assert.deepEqual(status, { username: null, guest: true, userCount: 0 });

  const registered = await ipcMain.invoke(CHANNELS.authRegister, 'paradise_player', 'gizli123');
  assert.deepEqual(registered, { username: 'paradise_player', guest: false });

  status = await ipcMain.invoke(CHANNELS.authStatus);
  assert.equal(status.username, 'paradise_player');
  assert.equal(status.userCount, 1);

  await ipcMain.invoke(CHANNELS.authLogout);
  status = await ipcMain.invoke(CHANNELS.authStatus);
  assert.equal(status.username, null);

  const loggedIn = await ipcMain.invoke(CHANNELS.authLogin, 'paradise_player', 'gizli123');
  assert.equal(loggedIn.username, 'paradise_player');

  await assert.rejects(() => ipcMain.invoke(CHANNELS.authLogin, 'paradise_player', 'yanlis'), /hatali/);
});

test('favoriler kullaniciya ozel saklanir', async (t) => {
  const { ipcMain } = await setup(t);

  await ipcMain.invoke(CHANNELS.authRegister, 'ali', 'sifre123');
  await ipcMain.invoke(CHANNELS.toggleFavorite, 730);
  let state = await ipcMain.invoke(CHANNELS.libraryGet);
  assert.equal(state.games.find((game) => game.appid === '730').favorite, true);

  await ipcMain.invoke(CHANNELS.authLogout);
  await ipcMain.invoke(CHANNELS.authRegister, 'ayse', 'sifre123');
  state = await ipcMain.invoke(CHANNELS.libraryGet);
  assert.equal(state.games.find((game) => game.appid === '730').favorite, false);

  await ipcMain.invoke(CHANNELS.toggleFavorite, 400);
  await ipcMain.invoke(CHANNELS.authLogin, 'ali', 'sifre123');
  state = await ipcMain.invoke(CHANNELS.libraryGet);
  assert.equal(state.games.find((game) => game.appid === '730').favorite, true);
  assert.equal(state.games.find((game) => game.appid === '400').favorite, false);
});

test('kutuphane, not ve surum kanallari calisir', async (t) => {
  const { ipcMain } = await setup(t);
  await ipcMain.invoke(CHANNELS.authRegister, 'oyuncu', 'sifre123');

  const refreshed = await ipcMain.invoke(CHANNELS.libraryRefresh);
  assert.equal(refreshed.games.length, 2);

  const note = await ipcMain.invoke(CHANNELS.setNote, 400, 'harika oyun');
  assert.equal(note.note, 'harika oyun');

  const info = await ipcMain.invoke(CHANNELS.appInfo);
  assert.deepEqual(info, { version: '0.2.0', steamRoot: '/sahte/steam' });
});

test('oyun baslatma, magaza sayfasi ve bedava kurulum Steam adreslerini acar', async (t) => {
  const { ipcMain, opened } = await setup(t);
  await ipcMain.invoke(CHANNELS.authRegister, 'oyuncu', 'sifre123');

  assert.deepEqual(await ipcMain.invoke(CHANNELS.launch, 730), { ok: true, uri: 'steam://rungameid/730' });
  assert.deepEqual(await ipcMain.invoke(CHANNELS.storePage, 570), { ok: true, uri: 'steam://store/570' });
  assert.deepEqual(await ipcMain.invoke(CHANNELS.installFree, 570), { ok: true, uri: 'steam://install/570' });

  assert.deepEqual(opened, ['steam://rungameid/730', 'steam://store/570', 'steam://install/570']);
});

test('katalog kanallari one cikanlari ve sayfalamayi dondurur', async (t) => {
  const { ipcMain, catalog } = await setup(t);

  const featured = await ipcMain.invoke(CHANNELS.catalogFeatured);
  assert.equal(featured[0].key, 'top_sellers');

  const browse = await ipcMain.invoke(CHANNELS.catalogBrowse, { freeOnly: true, page: 1, pageSize: 30 });
  assert.equal(browse.items[0].free, true);
  assert.deepEqual(catalog.calls[0], { freeOnly: true, page: 1, pageSize: 30 });
});

test('eksik bagimliliklar icin anlasilir hata firlatir', () => {
  assert.throws(() => registerIpcHandlers({ context: {} }), /ipcMain gerekli/);
  assert.throws(() => registerIpcHandlers({ ipcMain: createFakeIpcMain() }), /context veya service gerekli/);
});

