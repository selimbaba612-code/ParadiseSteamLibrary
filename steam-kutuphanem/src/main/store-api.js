'use strict';

/**
 * Steam'in herkese acik magaza API'si.
 *  - Arama:  https://store.steampowered.com/api/storesearch/?term=...
 *  - Detay:  https://store.steampowered.com/api/appdetails?appids=...
 *
 * API anahtari gerekmez; oyun dosyasi indirilmez, sadece magaza bilgisi okunur.
 */

const REQUEST_TIMEOUT_MS = 8000;

function buildImageUrl(appid) {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
}

function pickPrice(item) {
  if (!item || typeof item !== 'object') return null;
  const final = item.final;
  if (typeof final !== 'number') return null;
  return { final, currency: item.currency || '', formatted: item.final_formatted || '' };
}

async function fetchJson(url, { fetchImpl = globalThis.fetch, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch desteklenmiyor');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'SteamKutuphanem/0.1'
      }
    });

    if (!response || !response.ok) {
      throw new Error(`Steam API hatasi: ${response ? response.status : 'yanit yok'}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Magazada isimle arama yapar; hata durumunda bos liste dondurur. */
async function searchStore(term, { fetchImpl, timeoutMs, lang = 'turkish', country = 'TR' } = {}) {
  const query = String(term ?? '').trim();
  if (query.length < 2) return [];

  const url = 'https://store.steampowered.com/api/storesearch/'
    + `?term=${encodeURIComponent(query)}&l=${encodeURIComponent(lang)}&cc=${encodeURIComponent(country)}`;

  try {
    const data = await fetchJson(url, { fetchImpl, timeoutMs });
    const items = Array.isArray(data?.items) ? data.items : [];

    return items
      .map((item) => {
        const appid = Number(item?.id);
        if (!Number.isFinite(appid)) return null;
        return {
          appid,
          name: String(item.name || `Oyun ${appid}`),
          image: item.tiny_image || buildImageUrl(appid),
          price: pickPrice(item.price)
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Tek bir oyunun magaza detaylarini getirir; hata durumunda null dondurur. */
async function getAppDetails(appid, { fetchImpl, timeoutMs, lang = 'turkish', country = 'TR' } = {}) {
  const id = String(appid ?? '').trim();
  if (!/^\d+$/.test(id)) return null;

  const url = 'https://store.steampowered.com/api/appdetails'
    + `?appids=${id}&l=${encodeURIComponent(lang)}&cc=${encodeURIComponent(country)}`;

  try {
    const data = await fetchJson(url, { fetchImpl, timeoutMs });
    const entry = data?.[id];
    if (!entry || !entry.success || !entry.data) return null;

    const details = entry.data;
    return {
      appid: Number(id),
      name: String(details.name || `Oyun ${id}`),
      image: details.header_image || buildImageUrl(id),
      description: String(details.short_description || ''),
      developers: Array.isArray(details.developers) ? details.developers : [],
      publishers: Array.isArray(details.publishers) ? details.publishers : [],
      genres: Array.isArray(details.genres) ? details.genres.map((genre) => genre.description) : [],
      releaseDate: details.release_date?.date || '',
      metacritic: details.metacritic?.score ?? null,
      price: pickPrice(details.price_overview)
    };
  } catch {
    return null;
  }
}

module.exports = { searchStore, getAppDetails, buildImageUrl, fetchJson };
