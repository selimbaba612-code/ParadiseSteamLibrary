'use strict';

/**
 * Arayuz testi: gercek index.html + app.js jsdom icinde calisir,
 * window.api taklit edilir. Giris/kayit, kutuphane, magaza, bedava oyunlar,
 * favori, not ve cikis akislarini dogrular.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const rendererDir = path.join(__dirname, '..', 'src', 'renderer');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const GAMES = [
  { appid: '730', name: 'Counter-Strike 2', installed: true, sizeOnDisk: 2048, lastPlayed: 1700000000, favorite: false, note: '', image: 'https://cdn/730.jpg' },
  { appid: '400', name: 'Portal', installed: true, sizeOnDisk: 1024, lastPlayed: 0, favorite: true, note: 'yeniden oyna', image: 'https://cdn/400.jpg' },
  { appid: '620', name: 'Portal 2', installed: false, sizeOnDisk: 0, lastPlayed: 0, favorite: false, note: '', image: 'https://cdn/620.jpg' }
];

const FREE_GAMES = [
  { appid: 570, name: 'Dota 2', image: 'https://cdn/570.jpg', priceText: 'Ücretsiz', free: true, discountText: '' },
  { appid: 440, name: 'Team Fortress 2', image: 'https://cdn/440.jpg', priceText: 'Ücretsiz', free: true, discountText: '' }
];

function setup({ loggedIn = false } = {}) {
  const html = fs.readFileSync(path.join(rendererDir, 'index.html'), 'utf8');
  const source = fs.readFileSync(path.join(rendererDir, 'app.js'), 'utf8');

  const errors = [];
  const dom = new JSDOM(html, {
    url: 'https://sk.local/src/renderer/index.html',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole()
  });

  const { window } = dom;
  const calls = { register: [], login: [], browse: [], favorite: [], note: [], launch: [], install: [], store: [], logout: 0 };

  let session = loggedIn ? { username: 'test_oyuncu', guest: false } : { username: null, guest: true };

  window.api = {
    getAuthStatus: async () => ({ ...session, userCount: 1 }),
    register: async (username, password) => {
      calls.register.push([username, password]);
      session = { username, guest: false };
      return session;
    },
    login: async (username, password) => {
      calls.login.push([username, password]);
      session = { username, guest: false };
      return session;
    },
    logout: async () => {
      calls.logout += 1;
      session = { username: null, guest: true };
      return session;
    },
    getLibrary: async () => ({ steamRoot: '/sahte/steam', games: GAMES.map((game) => ({ ...game })) }),
    refreshLibrary: async () => ({ steamRoot: '/sahte/steam', games: GAMES.map((game) => ({ ...game })) }),
    search: async () => ({ local: [], store: [] }),
    browseCatalog: async (options) => {
      calls.browse.push(options);
      return { page: 0, items: FREE_GAMES, hasMore: false };
    },
    getFeatured: async () => ([
      { key: 'top_sellers', title: 'En Çok Satanlar', items: [{ appid: 730, name: 'CS2', image: 'https://cdn/730.jpg', priceText: 'Ücretsiz', free: true }] }
    ]),
    toggleFavorite: async (appid) => {
      calls.favorite.push(appid);
      const game = GAMES.find((item) => item.appid === String(appid));
      return { appid: String(appid), favorite: !game.favorite };
    },
    setNote: async (appid, note) => {
      calls.note.push([appid, note]);
      return { appid: String(appid), note };
    },
    launch: async (appid) => {
      calls.launch.push(appid);
      return { ok: true };
    },
    openStorePage: async (appid) => {
      calls.store.push(appid);
      return { ok: true };
    },
    installFree: async (appid) => {
      calls.install.push(appid);
      return { ok: true };
    },
    getAppInfo: async () => ({ version: '0.2.0', steamRoot: '/sahte/steam' })
  };

  window.addEventListener('error', (event) => errors.push(event.error || new Error(event.message)));
  window.addEventListener('unhandledrejection', (event) => errors.push(event.reason));
  window.eval(source);

  return { dom, window, errors, calls };
}

const errorMessages = (errors) => errors.map((error) => (error && error.message) || String(error));

test('acilista giris ekrani gorunur, uygulama gizlidir', async (t) => {
  const { dom, window, errors } = setup();
  t.after(() => dom.window.close());
  await wait(60);

  assert.ok(!window.document.getElementById('authScreen').classList.contains('hidden'));
  assert.ok(window.document.getElementById('appShell').classList.contains('hidden'));
  assert.equal(window.document.querySelectorAll('#gameGrid .card').length, 0);
  assert.deepEqual(errorMessages(errors), []);
});

test('kayit olunca uygulama acilir ve kutuphane listelenir', async (t) => {
  const { dom, window, errors, calls } = setup();
  t.after(() => dom.window.close());
  await wait(60);

  window.document.getElementById('authTabRegister').click();
  assert.equal(window.document.getElementById('authSubmit').textContent, 'Kayıt ol');

  window.document.getElementById('authUsername').value = 'paradise_player';
  window.document.getElementById('authPassword').value = 'gizli123';
  window.document.getElementById('authForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

  await wait(200);

  assert.deepEqual(calls.register, [['paradise_player', 'gizli123']]);
  assert.ok(window.document.getElementById('authScreen').classList.contains('hidden'));
  assert.ok(!window.document.getElementById('appShell').classList.contains('hidden'));
  assert.equal(window.document.getElementById('userName').textContent, 'paradise_player');
  assert.equal(window.document.querySelectorAll('#gameGrid .card').length, 3);
  assert.equal(window.document.getElementById('countFavorites').textContent, '1');
  assert.deepEqual(errorMessages(errors), []);
});

test('hatali giris hata mesajini gosterir', async (t) => {
  const { dom, window, errors } = setup();
  t.after(() => dom.window.close());
  await wait(60);

  window.api.login = async () => {
    throw new Error('Kullanici adi veya sifre hatali');
  };
  window.document.getElementById('authUsername').value = 'yok';
  window.document.getElementById('authPassword').value = 'yanlis123';
  window.document.getElementById('authForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

  await wait(120);

  const errorBox = window.document.getElementById('authError');
  assert.ok(!errorBox.classList.contains('hidden'));
  assert.match(errorBox.textContent, /hatali/);
  assert.ok(!window.document.getElementById('authScreen').classList.contains('hidden'));
  assert.deepEqual(errorMessages(errors), []);
});

test('magaza sekmesi one cikanlari, bedava sekmesi ucretsiz oyunlari gosterir', async (t) => {
  const { dom, window, errors, calls } = setup({ loggedIn: true });
  t.after(() => dom.window.close());
  await wait(200);

  window.document.getElementById('navStore').click();
  await wait(80);
  assert.ok(!window.document.getElementById('storeView').classList.contains('hidden'));
  assert.match(window.document.getElementById('featuredSections').textContent, /En Çok Satanlar/);

  window.document.getElementById('navFree').click();
  await wait(120);
  assert.deepEqual({ ...calls.browse[0] }, { freeOnly: true, page: 0, pageSize: 30 });

  const freeCards = window.document.querySelectorAll('#freeGrid .card');
  assert.equal(freeCards.length, 2);
  assert.match(window.document.getElementById('freeGrid').textContent, /Bedava/);

  const installButton = freeCards[0].querySelector('[data-action="install"]');
  installButton.click();
  await wait(60);
  assert.deepEqual(calls.install, ['570']);

  freeCards[1].querySelector('[data-action="store-page"]').click();
  await wait(60);
  assert.deepEqual(calls.store, ['440']);
  assert.deepEqual(errorMessages(errors), []);
});


test('arama magaza sonuclarini getirir', async (t) => {
  const { dom, window, errors, calls } = setup({ loggedIn: true });
  t.after(() => dom.window.close());
  await wait(200);

  const input = window.document.getElementById('searchInput');
  input.value = 'dota';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));

  // yerel kutuphane filtresi hemen uygulanir
  await wait(40);
  assert.equal(window.document.querySelectorAll('#gameGrid .card').length, 0);

  await wait(520);
  const searchCall = calls.browse.find((entry) => entry.query === 'dota');
  assert.ok(searchCall, 'magaza aramasi yapilmadi');
  assert.equal(searchCall.pageSize, 30);
  assert.ok(!window.document.getElementById('storeSearchSection').classList.contains('hidden'));
  assert.equal(window.document.querySelectorAll('#storeSearchGrid .card').length, 2);
  assert.deepEqual(errorMessages(errors), []);
});

test('favori yildizi API cagirir ve sayaci gunceller', async (t) => {
  const { dom, window, errors, calls } = setup({ loggedIn: true });
  t.after(() => dom.window.close());
  await wait(200);

  const csCard = window.document.querySelector('#gameGrid .card[data-appid="730"]');
  csCard.querySelector('[data-action="favorite"]').click();
  await wait(60);

  assert.deepEqual(calls.favorite, ['730']);
  assert.equal(window.document.getElementById('countFavorites').textContent, '2');

  const updated = window.document.querySelector('#gameGrid .card[data-appid="730"] [data-action="favorite"]');
  assert.equal(updated.textContent, '★');
  assert.deepEqual(errorMessages(errors), []);
});

test('detay panelinde not kaydedilir ve oyun baslatilir', async (t) => {
  const { dom, window, errors, calls } = setup({ loggedIn: true });
  t.after(() => dom.window.close());
  await wait(200);

  const portalCard = window.document.querySelector('#gameGrid .card[data-appid="400"]');
  portalCard.querySelector('[data-action="details"]').click();

  const panel = window.document.getElementById('detailPanel');
  assert.ok(!panel.classList.contains('hidden'));
  assert.equal(window.document.getElementById('detailTitle').textContent, 'Portal');
  assert.equal(window.document.getElementById('noteInput').value, 'yeniden oyna');

  window.document.getElementById('noteInput').value = 'yeni not';
  window.document.getElementById('noteSaveBtn').click();
  await wait(60);
  assert.deepEqual(calls.note, [['400', 'yeni not']]);

  window.document.getElementById('launchBtn').click();
  await wait(60);
  assert.deepEqual(calls.launch, ['400']);

  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.ok(panel.classList.contains('hidden'));
  assert.deepEqual(errorMessages(errors), []);
});

test('cikis yapinca giris ekranina donulur', async (t) => {
  const { dom, window, errors, calls } = setup({ loggedIn: true });
  t.after(() => dom.window.close());
  await wait(200);

  assert.ok(!window.document.getElementById('appShell').classList.contains('hidden'));
  window.document.getElementById('logoutBtn').click();
  await wait(120);

  assert.equal(calls.logout, 1);
  assert.ok(!window.document.getElementById('authScreen').classList.contains('hidden'));
  assert.ok(window.document.getElementById('appShell').classList.contains('hidden'));
  assert.deepEqual(errorMessages(errors), []);
});

test('misafir olarak devam edilebilir', async (t) => {
  const { dom, window } = setup();
  t.after(() => dom.window.close());
  await wait(60);

  window.document.getElementById('authGuest').click();
  await wait(200);

  assert.ok(!window.document.getElementById('appShell').classList.contains('hidden'));
  assert.equal(window.document.getElementById('userName').textContent, 'misafir');
  assert.equal(window.document.querySelectorAll('#gameGrid .card').length, 3);
});

