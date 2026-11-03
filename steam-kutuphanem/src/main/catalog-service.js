'use strict';

/**
 * Steam magaza katalogu: one cikanlar, arama ve bedava oyunlar.
 * Sadece Steam'in herkese acik uclari kullanilir, hicbir oyun dosyasi indirilmez.
 */

const storeApi = require('./store-api');

const SEARCH_URL = 'https://store.steampowered.com/search/results/';
const FEATURED_URL = 'https://store.steampowered.com/api/featuredcategories';
const CATEGORY_TITLES = {
  top_sellers: 'En Çok Satanlar',
  new_releases: 'Yeni Çıkanlar',
  specials: 'İndirimdekiler',
  coming_soon: 'Yakında'
};

function decodeEntities(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (match, code) => String.fromCharCode(Number(code)));
}

function stripTags(text) {
  return decodeEntities(String(text || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function buildImageUrl(appid) {
  return storeApi.buildImageUrl(appid);
}

/**
 * Steam arama sonucu HTML'ini oyun listesine cevirir.
 * Steam bu sayfayi JSON olarak vermedigi icin satirlari ayikliyoruz.
 */
function parseSearchResults(html) {
  const rows = String(html || '').match(/<a[^>]*class="[^"]*search_result_row[^"]*"[^>]*>[\s\S]*?<\/a>/g) || [];
  const items = [];
  const seen = new Set();

  for (const row of rows) {
    const appid = (row.match(/data-ds-appid="(\d+)"/) || [])[1];
    if (!appid || seen.has(appid)) continue;
    seen.add(appid);

    const name = decodeEntities((row.match(/class="title">([^<]*)</) || [])[1] || '').trim();
    const image = (row.match(/<img[^>]+src="([^"]+)"/) || [])[1] || buildImageUrl(appid);
    // "search_price_discount_combined" gibi kapsayici bloklari atlayip gercek
    // fiyat alanini ariyoruz (negatif lookahead ile).
    const priceMatch = row.match(/class="(?!.*(?:combined|discount))[^"]*search_price[^"]*"[^>]*>([\s\S]*?)<\/(?:div|span)>/);
    const priceText = stripTags(priceMatch ? priceMatch[1] : '');
    const discountText = stripTags((row.match(/class="[^"]*search_discount[^"]*"[^>]*>([\s\S]*?)<\/span>/) || [])[1] || '');

    items.push({
      appid: Number(appid),
      name: name || `Oyun ${appid}`,
      image,
      priceText,
      discountText,
      free: /ücretsiz|ucretsiz|free/i.test(priceText) || /ücretsiz|free/i.test(discountText)
    });
  }

  return items;
}

/** Arama / kategori sayfasi. pageSize ve page ile sayfalama yapilir. */
async function browse({ query = '', freeOnly = false, page = 0, pageSize = 30 } = {}, { fetchImpl, lang = 'turkish', country = 'TR' } = {}) {
  const size = Math.min(Math.max(Number(pageSize) || 30, 1), 100);
  const pageIndex = Math.max(Number(page) || 0, 0);

  const params = new URLSearchParams({
    start: String(pageIndex * size),
    count: String(size),
    category1: '998',
    infinite: '1',
    supportedlang: 'turkish',
    l: lang,
    cc: country
  });
  if (query) params.set('term', String(query));
  if (freeOnly) params.set('maxprice', 'free');

  const html = await storeApi.fetchText(`${SEARCH_URL}?${params.toString()}`, { fetchImpl });
  const items = parseSearchResults(html);

  return { page: pageIndex, pageSize: size, items, hasMore: items.length >= size };
}

function mapFeaturedItem(item) {
  const appid = Number(item && item.id);
  if (!Number.isFinite(appid)) return null;

  const priceOverview = item.price_overview && typeof item.price_overview === 'object' ? item.price_overview : null;
  const isFree = (typeof item.final_price === 'number' && item.final_price === 0)
    || /ücretsiz|free/i.test(priceOverview?.final_formatted || '');

  return {
    appid,
    name: String(item.name || `Oyun ${appid}`),
    image: item.header_image || item.large_capsule_image || item.small_capsule_image || buildImageUrl(appid),
    priceText: priceOverview?.final_formatted || (isFree ? 'Ücretsiz' : ''),
    discountText: item.discount_percent ? `%${item.discount_percent}` : '',
    free: isFree
  };
}

/** One cikanlar: cok satanlar, yeni cikanlar, indirimdekiler, yakinda. */
async function getFeatured({ fetchImpl } = {}) {
  const data = await storeApi.fetchJson(`${FEATURED_URL}?l=turkish&cc=TR`, { fetchImpl });
  const sections = [];

  for (const [key, title] of Object.entries(CATEGORY_TITLES)) {
    const items = Array.isArray(data?.[key]?.items) ? data[key].items : [];
    const mapped = items.map(mapFeaturedItem).filter(Boolean);
    if (mapped.length) sections.push({ key, title, items: mapped });
  }

  return sections;
}

/** Steam'de oyun sayfasini ya da kurulumu acan adresler (Steam istemcisi isi yapar). */
function storeUri(appid) {
  return `steam://store/${Number(appid)}`;
}

function installUri(appid) {
  return `steam://install/${Number(appid)}`;
}

module.exports = {
  browse,
  getFeatured,
  parseSearchResults,
  storeUri,
  installUri,
  decodeEntities,
  stripTags,
  CATEGORY_TITLES
};
