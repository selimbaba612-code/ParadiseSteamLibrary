'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parse, tokenize } = require('../src/main/vdf');

test('basit anahtar/deger ciftlerini okur', () => {
  const parsed = parse('"AppState" { "appid" "730" "name" "Counter-Strike 2" }');
  assert.deepEqual(parsed, { AppState: { appid: '730', name: 'Counter-Strike 2' } });
});

test('ic ice objeleri ve tirnaksiz degerleri okur', () => {
  const parsed = parse(`
    "libraryfolders"
    {
      "0"
      {
        "path" "C:\\\\Program Files (x86)\\\\Steam"
        "apps"
        {
          "730" "1234"
        }
      }
      "contentid" 12345
    }
  `);

  assert.equal(parsed.libraryfolders['0'].path, 'C:\\Program Files (x86)\\Steam');
  assert.equal(parsed.libraryfolders['0'].apps['730'], '1234');
  assert.equal(parsed.libraryfolders.contentid, '12345');
});

test('// yorumlarini atlar', () => {
  const parsed = parse(`
    // bu bir yorum
    "AppState"
    {
      "appid" "10" // satir sonu yorumu
      "name" "Test"
    }
  `);

  assert.deepEqual(parsed, { AppState: { appid: '10', name: 'Test' } });
});

test('kacis dizilerini cozer', () => {
  const parsed = parse('"root" { "name" "Oyun \\"Ozel\\" Adi" "yol" "C:\\\\Steam" }');
  assert.equal(parsed.root.name, 'Oyun "Ozel" Adi');
  assert.equal(parsed.root.yol, 'C:\\Steam');
});

test('bos metin bos obje dondurur', () => {
  assert.deepEqual(parse(''), {});
  assert.deepEqual(tokenize(''), []);
});

test('bozuk vdf icin anlasilir hata firlatir', () => {
  assert.throws(() => parse('"AppState" { "appid" "730" '), /kapanmayan suslu/i);
  assert.throws(() => parse('"AppState" { "appid" }'), /deger yok/i);
  assert.throws(() => parse('"name" "kapanmamis'), /kapanmayan tirnak/i);
});
