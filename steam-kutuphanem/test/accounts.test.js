'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { AccountStore, validateCredentials, hashPassword, verifyPassword } = require('../src/main/accounts');

async function createStore(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sk-accounts-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const filePath = path.join(dir, 'accounts.json');
  return { store: new AccountStore(filePath), filePath };
}

test('kayit olunur ve dogru sifre ile giris yapilir', async (t) => {
  const { store } = await createStore(t);

  const created = await store.register('paradise_player', 'gizli123');
  assert.deepEqual(created, { username: 'paradise_player' });

  const session = await store.authenticate('PARADISE_player', 'gizli123');
  assert.deepEqual(session, { username: 'paradise_player' });
  assert.equal(await store.count(), 1);
  assert.equal(await store.hasUsers(), true);
});

test('ayni kullanici adi ikinci kez alinamaz', async (t) => {
  const { store } = await createStore(t);
  await store.register('oyuncu', 'sifre123');
  await assert.rejects(() => store.register('Oyuncu', 'baska123'), /zaten alinmis/);
});

test('yanlis sifre ve olmayan kullanici reddedilir', async (t) => {
  const { store } = await createStore(t);
  await store.register('oyuncu', 'sifre123');

  await assert.rejects(() => store.authenticate('oyuncu', 'yanlis'), /hatali/);
  await assert.rejects(() => store.authenticate('yokboyle', 'sifre123'), /hatali/);
});

test('gecersiz kullanici adi ve kisa sifre reddedilir', async (t) => {
  const { store } = await createStore(t);

  await assert.rejects(() => store.register('ab', 'sifre123'), /3-20 karakter/);
  await assert.rejects(() => store.register('boşluk lu', 'sifre123'), /3-20 karakter/);
  await assert.rejects(() => store.register('oyuncu', '123'), /en az 6/);

  const credentials = validateCredentials(' gecerli_ad ', 'sifre123');
  assert.deepEqual(credentials, { username: 'gecerli_ad', password: 'sifre123' });
});

test('sifreler duz metin olarak saklanmaz', async (t) => {
  const { store, filePath } = await createStore(t);
  await store.register('oyuncu', 'cok-gizli-123');

  const raw = await fs.readFile(filePath, 'utf8');
  assert.ok(!raw.includes('cok-gizli-123'), 'sifre duz metin olarak dosyada!');

  const parsed = JSON.parse(raw);
  const user = parsed.users.oyuncu;
  assert.ok(user.salt && user.hash);
  assert.equal(user.hash.length, 128); // 64 byte scrypt ozeti (hex)
});

test('ayni sifre farkli kullanicilarda farkli ozet uretir (tuz)', async () => {
  const first = hashPassword('ayni-sifre');
  const second = hashPassword('ayni-sifre');
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.hash, second.hash);
  assert.equal(verifyPassword('ayni-sifre', first.salt, first.hash), true);
  assert.equal(verifyPassword('yanlis', first.salt, first.hash), false);
});

test('bozuk hesap dosyasi uygulamayi kilitlemez', async (t) => {
  const { store, filePath } = await createStore(t);
  await fs.writeFile(filePath, '{ bozuk');

  assert.equal(await store.hasUsers(), false);
  await store.register('yeni', 'sifre123');
  assert.equal(await store.count(), 1);
});
