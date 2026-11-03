'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const storeApi = require('../src/main/store-api');

function jsonFetch(payload, { ok = true, status = 200 } = {}) {
  return async () => ({
    ok,
    status,
    json: async () => payload
  });
}

test('magaza aramasi sonuclari oyun nesnelerine cevrilir', async () => {
  const fetchImpl = jsonFetch({
    items: [
      { id: 220, name: 'Half-Life 2', tiny_image: 'https://cdn/220.jpg', price: { final: 0, currency: 'TRY', final_formatted: '0,00 TL' } },
      { id: '730', name: 'Counter-Strike 2' },
      { name: 'appid yok' }
    ]
  });

  const results = await storeApi.searchStore('half life', { fetchImpl });
  assert.equal(results.length, 2);
  assert.deepEqual(results[0], {
    appid: 220,
    name: 'Half-Life 2',
    image: 'https://cdn/220.jpg',
    price: { final: 0, currency: 'TRY', formatted: '0,00 TL' }
  });
  assert.equal(results[1].image, storeApi.buildImageUrl(730));
});

test('kisa arama terimi icin istek atilmaz', async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return { ok: true, status: 200, json: async () => ({}) };
  };

  assert.deepEqual(await storeApi.searchStore('a', { fetchImpl }), []);
  assert.equal(called, false);
});

test('magaza hatasi bos liste dondurur, uygulama cokmez', async () => {
  const failing = async () => {
    throw new Error('ag kapali');
  };
  assert.deepEqual(await storeApi.searchStore('portal', { fetchImpl: failing }), []);
  assert.equal(await storeApi.getAppDetails(400, { fetchImpl: failing }), null);

  const notOk = jsonFetch({}, { ok: false, status: 503 });
  assert.deepEqual(await storeApi.searchStore('portal', { fetchImpl: notOk }), []);
});

test('oyun detaylari istenen alanlara indirgenir', async () => {
  const fetchImpl = jsonFetch({
    400: {
      success: true,
      data: {
        name: 'Portal',
        header_image: 'https://cdn/portal.jpg',
        short_description: 'Bulmaca oyunu',
        developers: ['Valve'],
        publishers: ['Valve'],
        genres: [{ description: 'Action' }, { description: 'Puzzle' }],
        release_date: { date: '10 Eki, 2007' },
        metacritic: { score: 90 },
        price_overview: { final: 0, currency: 'TRY', final_formatted: 'Ücretsiz' }
      }
    }
  });

  const details = await storeApi.getAppDetails(400, { fetchImpl });
  assert.equal(details.name, 'Portal');
  assert.deepEqual(details.genres, ['Action', 'Puzzle']);
  assert.equal(details.metacritic, 90);
  assert.equal(details.releaseDate, '10 Eki, 2007');
  assert.equal(details.price.formatted, 'Ücretsiz');
});

test('gecersiz appid icin detay istegi atilmaz', async () => {
  assert.equal(await storeApi.getAppDetails('abc', { fetchImpl: jsonFetch({}) }), null);
  assert.equal(await storeApi.getAppDetails(null, { fetchImpl: jsonFetch({}) }), null);
});
