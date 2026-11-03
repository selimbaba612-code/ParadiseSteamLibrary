'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { UserDataStore, MAX_NOTE_LENGTH } = require('../src/main/user-data-store');

async function createStore(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sk-data-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const filePath = path.join(dir, 'alt', 'user-data.json');
  return { store: new UserDataStore(filePath), filePath };
}

test('favori ekleme ve cikarma kalici olarak saklanir', async (t) => {
  const { store, filePath } = await createStore(t);

  const added = await store.toggleFavorite(730);
  assert.deepEqual(added, { appid: '730', favorite: true });

  const removed = await store.toggleFavorite('730');
  assert.deepEqual(removed, { appid: '730', favorite: false });

  await store.toggleFavorite(570);
  const onDisk = JSON.parse(await fs.readFile(filePath, 'utf8'));
  assert.deepEqual(onDisk.favorites, ['570']);

  // Yeni bir ornek ayni dosyadan okumali
  const second = new UserDataStore(filePath);
  assert.deepEqual(await second.listFavorites(), ['570']);
});

test('notlar kirpilir, bosaltilinca silinir', async (t) => {
  const { store } = await createStore(t);

  const longNote = 'x'.repeat(MAX_NOTE_LENGTH + 100);
  const saved = await store.setNote(400, `  ${longNote}  `);
  assert.equal(saved.note.length, MAX_NOTE_LENGTH);
  assert.equal(await store.getNote(400), saved.note);

  await store.setNote(400, '   ');
  assert.equal(await store.getNote(400), '');
});

test('gecersiz appid reddedilir', async (t) => {
  const { store } = await createStore(t);
  await assert.rejects(() => store.toggleFavorite('abc'), /Gecersiz appid/);
  await assert.rejects(() => store.setNote(null, 'deneme'), /Gecersiz appid/);
});

test('bozuk json dosyasi uygulamayi kilitlemez', async (t) => {
  const { store, filePath } = await createStore(t);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, '{ bozuk json');

  const snapshot = await store.getSnapshot();
  assert.deepEqual(snapshot, { favorites: [], notes: {} });

  const added = await store.toggleFavorite(10);
  assert.equal(added.favorite, true);
});
