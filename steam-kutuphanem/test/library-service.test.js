'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { LibraryService } = require('../src/main/library-service');
const { UserDataStore } = require('../src/main/user-data-store');

const FAKE_GAMES = [
  { appid: 730, name: 'Counter-Strike 2', installed: true, sizeOnDisk: 2048, lastPlayed: 1700000000, libraryPath: '/steam' },
  { appid: 400, name: 'Portal', installed: true, sizeOnDisk: 1024, lastPlayed: 0, libraryPath: '/steam' },
  { appid: 620, name: 'Portal 2', installed: false, sizeOnDisk: 0, lastPlayed: 0, libraryPath: '/steam' }
];

function createService(t, { searchResults = [] } = {}) {
  return fs.mkdtemp(path.join(os.tmpdir(), 'sk-service-')).then((dir) => {
    t.after(() => fs.rm(dir, { recursive: true, force: true }));

    const userDataStore = new UserDataStore(path.join(dir, 'user-data.json'));
    const scanner = {
      findSteamRoot: async () => '/steam',
      scanSteamLibrary: async (root) => ({ steamRoot: root, libraries: [root], games: FAKE_GAMES.map((game) => ({ ...game })) })
    };
    const store = {
      searchStore: async (term) => searchResults.filter((item) => item.name.toLowerCase().includes(term.toLowerCase()))
    };

    return { service: new LibraryService({ userDataStore, scanner, store, now: () => 1234 }), userDataStore };
  });
}

test('kutuphane taramasi kapak, favori ve notlarla birlestirilir', async (t) => {
  const { service, userDataStore } = await createService(t);
  await userDataStore.toggleFavorite(730);
  await userDataStore.setNote(400, 'yeniden oyna');

  const state = await service.scan();
  assert.equal(state.steamRoot, '/steam');
  assert.equal(state.scannedAt, 1234);
  assert.equal(state.games.length, 3);
  assert.equal(state.favoriteCount, 1);
  assert.equal(state.totalSize, 3072);

  const cs = state.games.find((game) => game.appid === '730');
  assert.equal(cs.favorite, true);
  assert.equal(cs.image, 'https://cdn.cloudflare.steamstatic.com/steam/apps/730/header.jpg');

  const portal = state.games.find((game) => game.appid === '400');
  assert.equal(portal.note, 'yeniden oyna');
  assert.equal(portal.favorite, false);
});

test('onbellek kullanilir, refresh yeniden tarar', async (t) => {
  const { service } = await createService(t);
  let scanCount = 0;
  const original = service.scanner.scanSteamLibrary;
  service.scanner.scanSteamLibrary = async (root) => {
    scanCount += 1;
    return original(root);
  };

  await service.getState();
  await service.getState();
  assert.equal(scanCount, 1);

  await service.refresh();
  assert.equal(scanCount, 2);
});

test('favori degisikligi onbellege de yansir', async (t) => {
  const { service } = await createService(t);
  await service.getState();

  const result = await service.toggleFavorite('620');
  assert.equal(result.favorite, true);

  const state = await service.getState();
  assert.equal(state.favoriteCount, 1);
  assert.equal(state.games.find((game) => game.appid === '620').favorite, true);
});

test('arama once yerel kutuphanede, sonra magazada calisir', async (t) => {
  const { service } = await createService(t, { searchResults: [{ appid: 220, name: 'Half-Life 2' }] });

  const result = await service.search('portal');
  assert.deepEqual(result.local.map((game) => game.appid), ['400', '620']);
  assert.deepEqual(result.store, []);

  const storeResult = await service.search('half');
  assert.deepEqual(storeResult.local, []);
  assert.equal(storeResult.store.length, 1);

  // appid ile arama
  const byId = await service.search('730');
  assert.deepEqual(byId.local.map((game) => game.appid), ['730']);
});

test('bos arama terimi bos sonuc dondurur', async (t) => {
  const { service } = await createService(t);
  assert.deepEqual(await service.search('   '), { local: [], store: [] });
});

test('baslatma adresi steam:// URI formatindadir', async (t) => {
  const { service } = await createService(t);
  assert.equal(await service.buildLaunchUri(730), 'steam://rungameid/730');
  await assert.rejects(() => service.buildLaunchUri('x'), /Gecersiz appid/);
});
