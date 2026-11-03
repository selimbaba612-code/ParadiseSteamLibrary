'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const catalog = require('../src/main/catalog-service');

const SEARCH_HTML = `
<div id="search_resultsRows">
  <a href="https://store.steampowered.com/app/570/?snr=1" data-ds-appid="570" class="search_result_row ds_collapse_flag">
    <div class="col search_capsule"><img src="https://cdn/570.jpg"></div>
    <div class="col search_name"><span class="title">Dota 2</span></div>
    <div class="col search_price_discount_combined"><div class="col search_price">Ücretsiz</div></div>
  </a>
  <a href="https://store.steampowered.com/app/730/?snr=1" data-ds-appid="730" class="search_result_row">
    <div class="col search_capsule"><img src="https://cdn/730.jpg"></div>
    <div class="col search_name"><span class="title">Counter-Strike 2</span></div>
    <div class="col search_price_discount_combined">
      <div class="col search_discount"><span>-50%</span></div>
      <div class="col search_price">100,00 TL</div>
    </div>
  </a>
  <a href="https://store.steampowered.com/app/730/" data-ds-appid="730" class="search_result_row">
    <span class="title">Counter-Strike 2 (tekrar)</span>
  </a>
</div>`;

function htmlResponse(html) {
  return async () => ({ ok: true, status: 200, text: async () => html, json: async () => ({}) });
}

test('arama sonucu HTML satirlari oyunlara cevrilir ve tekrarlar atilir', () => {
  const items = catalog.parseSearchResults(SEARCH_HTML);

  assert.equal(items.length, 2, 'ayni appid iki kez listelenmemeli');
  assert.deepEqual(items.map((item) => item.appid), [570, 730]);

  const dota = items[0];
  assert.equal(dota.name, 'Dota 2');
  assert.equal(dota.image, 'https://cdn/570.jpg');
  assert.equal(dota.free, true);

  const cs = items[1];
  assert.equal(cs.name, 'Counter-Strike 2');
  assert.equal(cs.free, false);
  assert.equal(cs.discountText, '-50%');
  assert.match(cs.priceText, /100,00 TL/);
});

test('HTML varliklari cozulur', () => {
  assert.equal(catalog.decodeEntities('Tom &amp; Jerry &quot;x&quot; &#39;y&#39;'), 'Tom & Jerry "x" \'y\'');
  assert.equal(catalog.stripTags('<div>  Portal&nbsp;2 </div>'), 'Portal 2');
});

test('browse adresi arama, bedava ve sayfalama parametrelerini icerir', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(String(url));
    return { ok: true, status: 200, text: async () => SEARCH_HTML };
  };

  const result = await catalog.browse({ query: 'portal 2', freeOnly: true, page: 2, pageSize: 10 }, { fetchImpl });
  assert.equal(result.page, 2);
  assert.equal(result.pageSize, 10);
  assert.equal(result.items.length, 2);
  assert.equal(result.hasMore, false);

  assert.ok(urls[0].includes('term=portal+2') || urls[0].includes('term=portal%202'), urls[0]);
  assert.ok(urls[0].includes('maxprice=free'));
  assert.ok(urls[0].includes('start=20'));
  assert.ok(urls[0].includes('count=10'));
});

test('browse sayfa boyutunu sinirlar ve hatalari yukari firlatir', async () => {
  const failing = async () => ({ ok: false, status: 500, text: async () => '' });
  await assert.rejects(() => catalog.browse({ pageSize: 500 }, { fetchImpl: failing }), /Steam istegi basarisiz/);

  let seenUrl = '';
  const fetchImpl = async (url) => {
    seenUrl = String(url);
    return { ok: true, status: 200, text: async () => '' };
  };
  const result = await catalog.browse({ pageSize: 500, page: -3 }, { fetchImpl });
  assert.equal(result.pageSize, 100);
  assert.equal(result.page, 0);
  assert.ok(seenUrl.includes('count=100'));
});

test('one cikanlar bolumlenir ve bos kategoriler atlanir', async () => {
  const payload = {
    top_sellers: { items: [{ id: 730, name: 'CS2', header_image: 'https://cdn/730.jpg', price_overview: { final_formatted: 'Ücretsiz' }, discount_percent: 0 }] },
    new_releases: { items: [{ id: 2358720, name: 'Black Myth', final_price: 0 }] },
    specials: { items: [] },
    coming_soon: { items: [{ id: 1, name: 'Gelecek Oyun', large_capsule_image: 'https://cdn/big.jpg' }] }
  };

  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => payload });
  const sections = await catalog.getFeatured({ fetchImpl });

  assert.deepEqual(sections.map((section) => section.key), ['top_sellers', 'new_releases', 'coming_soon']);
  assert.equal(sections[0].title, 'En Çok Satanlar');
  assert.equal(sections[0].items[0].free, true);
  assert.equal(sections[1].items[0].priceText, 'Ücretsiz');
  assert.equal(sections[2].items[0].image, 'https://cdn/big.jpg');
});

test('Steam kisayol adresleri dogru uretilir', () => {
  assert.equal(catalog.storeUri(570), 'steam://store/570');
  assert.equal(catalog.installUri(570), 'steam://install/570');
  assert.equal(catalog.storeUri(730), 'steam://store/730');
});
