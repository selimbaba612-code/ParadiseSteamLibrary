'use strict';

/**
 * Arayuz dumani testi: gercek index.html + app.js jsdom icinde calistirilir,
 * window.api taklit edilir. Boylece DOM kimlikleri, filtreler, favori/not
 * akislari ve baslatma dugmesi gercekten test edilir.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const rendererDir = path.join(__dirname, '..', 'src', 'renderer');

const GAMES = [
  { appid: '730', name: 'Counter-Strike 2', installed: true, sizeOnDisk: 2048, lastPlayed: 1700000000, favorite: true, note: '', image: 'https://cdn/730.jpg' },
  { appid: '400', name: 'Portal', installed: true, sizeOnDisk: 1024, lastPlayed: 0, favorite: false, note: 'yeniden oyna', image: 'https://cdn/400.jpg' },
  { appid: '620', name: 'Portal 2', installed: false, sizeOnDisk: 0, lastPlayed: 0, favorite: false, note: '', image: 'https://cdn/620.jpg' }
];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function setup() {
  const html = fs.readFileSync(path.join(rendererDir, 'index.html'), 'utf8');
  const source = fs.readFileSync(path.join(rendererDir, 'app.js'), 'utf8');
  const errors = [];
  const virtualConsole = new VirtualConsole();

  const dom = new JSDOM(html, {
    url: 'https://sk.local/src/renderer/index.html',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole
  });

  const { window } = dom;
  const calls = { search: [], favorite: [], note: [], launch: [], refresh: 0 };

  window.api = {
    getLibrary: async () => ({ steamRoot: '/sahte/steam', libraries: ['/sahte/steam'], games: GAMES.map((game) => ({ ...game })) }),
    refreshLibrary: async () => {
      calls.refresh += 1;
      return { steamRoot: '/sahte/steam', games: GAMES.map((game) => ({ ...game })) };
    },
    search: async (term) => {
      calls.search.push(term);
      return { local: [], store: [{ appid: 220, name: 'Half-Life 2', image: 'https://cdn/220.jpg' }] };
    },
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
    getAppInfo: async () => ({ version: '0.1.0', steamRoot: '/sahte/steam' })
  };

  window.addEventListener('error', (event) => errors.push(event.error || new Error(event.message)));
  window.addEventListener('unhandledrejection', (event) => errors.push(event.reason));
  window.eval(source);

  return { dom, window, errors, calls };
}

test('arayuz kutuphaneyi listeler ve sayaclari gunceller', async (t) => {
  const { dom, window, errors } = setup();
  t.after(() => dom.window.close());
  await wait(60);

  const cards = window.document.querySelectorAll('#gameGrid .card');
  assert.equal(cards.length, 3);
  assert.equal(window.document.getElementById('countAll').textContent, '3');
  assert.equal(window.document.getElementById('countInstalled').textContent, '2');
  assert.equal(window.document.getElementById('countFavorites').textContent, '1');
  assert.match(window.document.getElementById('steamRoot').textContent, /\/sahte\/steam/);
  assert.equal(window.document.getElementById('appVersion').textContent, 'v0.1.0');
  assert.deepEqual(errors, []);
});

test('filtreler kurulu ve favori oyunlari ayirir', async (t) => {
  const { dom, window, errors } = setup();
  t.after(() => dom.window.close());
  await wait(60);

  const chip = (filter) => window.document.querySelector(`[data-filter="${filter}"]`);
  const visibleNames = () => [...window.document.querySelectorAll('#gameGrid .card h3')].map((node) => node.textContent);

  chip('installed').click();
  assert.deepEqual(visibleNames(), ['Counter-Strike 2', 'Portal']);

  chip('favorites').click();
  assert.deepEqual(visibleNames(), ['Counter-Strike 2']);
  assert.ok(chip('favorites').classList.contains('active'));
  assert.ok(!chip('all').classList.contains('active'));

  chip('all').click();
  assert.equal(visibleNames().length, 3);
  assert.deepEqual(errors, []);
});

test('arama yerel listeyi suzer ve magaza sonuclarini gosterir', async (t) => {
  const { dom, window, errors, calls } = setup();
  t.after(() => dom.window.close());
  await wait(60);

  const input = window.document.getElementById('searchInput');
  input.value = 'portal';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));

  // yerel filtre hemen uygulanir
  const names = [...window.document.querySelectorAll('#gameGrid .card h3')].map((node) => node.textContent);
  assert.deepEqual(names, ['Portal', 'Portal 2']);

  // magaza aramasi 400 ms sonra calisir
  await wait(520);
  assert.deepEqual(calls.search, ['portal']);
  const storeSection = window.document.getElementById('storeSection');
  assert.ok(!storeSection.classList.contains('hidden'));
  assert.match(window.document.getElementById('storeGrid').textContent, /Half-Life 2/);
  assert.deepEqual(errors, []);
});

test('favori yildizi API cagirir ve arayuzu gunceller', async (t) => {
  const { dom, window, errors, calls } = setup();
  t.after(() => dom.window.close());
  await wait(60);

  const portalCard = window.document.querySelector('#gameGrid .card[data-appid="400"]');
  const star = portalCard.querySelector('[data-action="favorite"]');
  assert.equal(star.textContent, '☆');

  star.click();
  await wait(40);

  assert.deepEqual(calls.favorite, ['400']);

  // Kart yeniden cizildigi icin yildizi tekrar sorguluyoruz
  const updatedStar = window.document.querySelector('#gameGrid .card[data-appid="400"] [data-action="favorite"]');
  assert.equal(updatedStar.textContent, '★');
  assert.ok(updatedStar.classList.contains('active'));
  assert.equal(window.document.getElementById('countFavorites').textContent, '2');
  assert.deepEqual(errors, []);
});


test('detay panelinde not kaydedilir ve oyun baslatilir', async (t) => {
  const { dom, window, errors, calls } = setup();
  t.after(() => dom.window.close());
  await wait(60);

  const portalCard = window.document.querySelector('#gameGrid .card[data-appid="400"]');
  portalCard.querySelector('[data-action="details"]').click();

  const panel = window.document.getElementById('detailPanel');
  assert.ok(!panel.classList.contains('hidden'));
  assert.equal(window.document.getElementById('detailTitle').textContent, 'Portal');
  assert.equal(window.document.getElementById('noteInput').value, 'yeniden oyna');

  const noteInput = window.document.getElementById('noteInput');
  noteInput.value = 'yeni not';
  window.document.getElementById('noteSaveBtn').click();
  await wait(40);
  assert.deepEqual(calls.note, [['400', 'yeni not']]);

  window.document.getElementById('launchBtn').click();
  await wait(40);
  assert.deepEqual(calls.launch, ['400']);

  // Escape paneli kapatir
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.ok(panel.classList.contains('hidden'));
  assert.deepEqual(errors, []);
});

test('Yenile dugmesi kutuphaneyi yeniden tarar', async (t) => {
  const { dom, window, calls } = setup();
  t.after(() => dom.window.close());
  await wait(60);

  window.document.getElementById('refreshBtn').click();
  await wait(60);
  assert.equal(calls.refresh, 1);
});

test('kutuphane bos oldugunda bilgilendirme gosterilir', async (t) => {
  const { dom, window } = setup();
  t.after(() => dom.window.close());
  await wait(60);

  window.eval('window.__steamKutuphanem.state.games = []; window.__steamKutuphanem.renderLibrary();');
  assert.match(window.document.getElementById('gameGrid').textContent, /Kütüphanede oyun bulunamadı/);
  assert.equal(window.document.getElementById('countAll').textContent, '0');
});

