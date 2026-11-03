'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { CHANNELS, registerIpcHandlers } = require('../src/main/ipc');

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

function createFakeService() {
  const calls = { toggleFavorite: [], setNote: [], search: [], refresh: 0 };
  return {
    calls,
    getState: async () => ({ steamRoot: '/steam', games: [{ appid: '730', name: 'CS2' }] }),
    refresh: async () => {
      calls.refresh += 1;
      return { steamRoot: '/steam', games: [] };
    },
    search: async (term) => {
      calls.search.push(term);
      return { local: [], store: [{ appid: 220, name: 'Half-Life 2' }] };
    },
    toggleFavorite: async (appid) => {
      calls.toggleFavorite.push(appid);
      return { appid: String(appid), favorite: true };
    },
    setNote: async (appid, note) => {
      calls.setNote.push([appid, note]);
      return { appid: String(appid), note };
    },
    buildLaunchUri: async (appid) => `steam://rungameid/${appid}`
  };
}

test('butun kanallar kaydedilir ve beklenen veriyi dondurur', async () => {
  const ipcMain = createFakeIpcMain();
  const service = createFakeService();
  const launched = [];

  registerIpcHandlers({
    ipcMain,
    service,
    launchUri: async (uri) => launched.push(uri),
    getVersion: () => '0.1.0',
    getSteamRoot: async () => '/steam'
  });

  assert.deepEqual([...ipcMain.handlers.keys()].sort(), Object.values(CHANNELS).sort());
  assert.equal(ipcMain.duplicates.length, 0);

  const state = await ipcMain.invoke(CHANNELS.libraryGet);
  assert.equal(state.games[0].appid, '730');

  const refreshed = await ipcMain.invoke(CHANNELS.libraryRefresh);
  assert.deepEqual(refreshed.games, []);
  assert.equal(service.calls.refresh, 1);

  const found = await ipcMain.invoke(CHANNELS.storeSearch, 'half');
  assert.equal(found.store.length, 1);
  assert.deepEqual(service.calls.search, ['half']);

  const favorite = await ipcMain.invoke(CHANNELS.toggleFavorite, 730);
  assert.equal(favorite.favorite, true);
  assert.deepEqual(service.calls.toggleFavorite, [730]);

  const note = await ipcMain.invoke(CHANNELS.setNote, 730, 'iyi oyun');
  assert.equal(note.note, 'iyi oyun');
  assert.deepEqual(service.calls.setNote, [[730, 'iyi oyun']]);

  const launch = await ipcMain.invoke(CHANNELS.launch, 730);
  assert.deepEqual(launch, { ok: true, uri: 'steam://rungameid/730' });
  assert.deepEqual(launched, ['steam://rungameid/730']);

  const info = await ipcMain.invoke(CHANNELS.appInfo);
  assert.deepEqual(info, { version: '0.1.0', steamRoot: '/steam' });
});

test('baslatici yoksa hata verir', async () => {
  const ipcMain = createFakeIpcMain();
  registerIpcHandlers({ ipcMain, service: createFakeService(), getVersion: () => '0.1.0' });
  await assert.rejects(() => ipcMain.invoke(CHANNELS.launch, 730), /Baslatici tanimli degil/);
});

test('eksik bagimliliklar icin anlasilir hata firlatir', () => {
  assert.throws(() => registerIpcHandlers({ service: createFakeService() }), /ipcMain gerekli/);
  assert.throws(() => registerIpcHandlers({ ipcMain: createFakeIpcMain() }), /service gerekli/);
});
