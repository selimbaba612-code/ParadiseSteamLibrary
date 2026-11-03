/* Steam Kütüphanem - arayüz kodu (contextIsolation: sadece window.api kullanılır) */
(function () {
  'use strict';

  const api = window.api;
  const dom = {};
  const state = {
    games: [],
    filter: 'all',
    query: '',
    selectedAppId: null,
    info: null,
    searchTimer: null
  };

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value <= 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = value;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit += 1;
    }
    const digits = size >= 100 || unit === 0 ? 0 : 1;
    return `${size.toFixed(digits)} ${units[unit]}`;
  }

  function formatDate(unixSeconds) {
    const value = Number(unixSeconds) || 0;
    if (value <= 0) return 'Hiç oynanmadı';
    try {
      return new Date(value * 1000).toLocaleDateString('tr-TR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return '—';
    }
  }

  function cacheDom() {
    const ids = [
      'steamRoot', 'searchInput', 'refreshBtn', 'filterBar', 'countAll', 'countInstalled',
      'countFavorites', 'sizeInfo', 'statusBar', 'gameGrid', 'storeSection', 'storeGrid',
      'detailPanel', 'detailClose', 'detailImage', 'detailTitle', 'detailMeta', 'noteInput',
      'noteSaveBtn', 'launchBtn', 'toast', 'appVersion'
    ];
    for (const id of ids) dom[id] = document.getElementById(id);
  }

  function setStatus(text, hidden = false) {
    if (!dom.statusBar) return;
    dom.statusBar.textContent = text || '';
    dom.statusBar.classList.toggle('hidden', hidden || !text);
  }

  let toastTimer = null;
  function toast(message, isError = false) {
    if (!dom.toast) return;
    dom.toast.textContent = message;
    dom.toast.classList.toggle('error', Boolean(isError));
    dom.toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => dom.toast.classList.add('hidden'), 3200);
  }

  function visibleGames() {
    const needle = state.query.trim().toLocaleLowerCase('tr');
    return state.games.filter((game) => {
      if (state.filter === 'installed' && !game.installed) return false;
      if (state.filter === 'favorites' && !game.favorite) return false;
      if (!needle) return true;
      const name = String(game.name || '').toLocaleLowerCase('tr');
      return name.includes(needle) || String(game.appid).includes(needle);
    });
  }

  function createCard(game, options = {}) {
    const card = document.createElement('article');
    card.className = 'card';
    card.dataset.appid = String(game.appid);

    const image = document.createElement('img');
    image.alt = game.name || '';
    image.loading = 'lazy';
    image.src = game.image || '';
    image.addEventListener('error', () => {
      image.removeAttribute('src');
    });
    card.appendChild(image);

    const star = document.createElement('button');
    star.type = 'button';
    star.className = `star${game.favorite ? ' active' : ''}`;
    star.dataset.action = 'favorite';
    star.title = game.favorite ? 'Favorilerden çıkar' : 'Favorilere ekle';
    star.textContent = game.favorite ? '★' : '☆';
    card.appendChild(star);

    const body = document.createElement('div');
    body.className = 'card-body';

    const title = document.createElement('h3');
    title.textContent = game.name || `Oyun ${game.appid}`;
    body.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'card-meta';
    if (options.compact) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'Mağaza';
      meta.appendChild(badge);
    } else {
      const size = document.createElement('span');
      size.textContent = formatBytes(game.sizeOnDisk);
      meta.appendChild(size);

      const played = document.createElement('span');
      played.textContent = formatDate(game.lastPlayed);
      meta.appendChild(played);

      if (!game.installed) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = 'Kurulu değil';
        meta.appendChild(badge);
      }
    }
    body.appendChild(meta);

    if (!options.compact) {
      const actions = document.createElement('div');
      actions.className = 'card-actions';

      const launch = document.createElement('button');
      launch.type = 'button';
      launch.className = 'btn primary';
      launch.dataset.action = 'launch';
      launch.textContent = 'Oyna';
      actions.appendChild(launch);

      const details = document.createElement('button');
      details.type = 'button';
      details.className = 'btn';
      details.dataset.action = 'details';
      details.textContent = 'Detay';
      actions.appendChild(details);

      body.appendChild(actions);
    }

    card.appendChild(body);
    return card;
  }

  function renderLibrary() {
    const grid = dom.gameGrid;
    if (!grid) return;

    grid.textContent = '';
    const games = visibleGames();

    if (dom.countAll) dom.countAll.textContent = String(state.games.length);
    if (dom.countInstalled) dom.countInstalled.textContent = String(state.games.filter((game) => game.installed).length);
    if (dom.countFavorites) dom.countFavorites.textContent = String(state.games.filter((game) => game.favorite).length);
    if (dom.sizeInfo) {
      const total = state.games.reduce((sum, game) => sum + (Number(game.sizeOnDisk) || 0), 0);
      dom.sizeInfo.textContent = state.games.length ? `Toplam ${formatBytes(total)}` : '';
    }

    if (!games.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = state.games.length
        ? 'Bu filtreye uyan oyun yok.'
        : 'Kütüphanede oyun bulunamadı. Steam kurulu mu?';
      grid.appendChild(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const game of games) fragment.appendChild(createCard(game));
    grid.appendChild(fragment);
  }

  function renderStoreResults(items) {
    if (!dom.storeSection || !dom.storeGrid) return;

    dom.storeGrid.textContent = '';
    if (!Array.isArray(items) || items.length === 0) {
      dom.storeSection.classList.add('hidden');
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const item of items) {
      fragment.appendChild(createCard({
        appid: item.appid,
        name: item.name,
        image: item.image,
        favorite: false,
        installed: false
      }, { compact: true }));
    }
    dom.storeGrid.appendChild(fragment);
    dom.storeSection.classList.remove('hidden');
  }

  function openDetail(appid) {
    const game = state.games.find((item) => item.appid === String(appid));
    if (!game || !dom.detailPanel) return;

    state.selectedAppId = game.appid;
    dom.detailTitle.textContent = game.name;
    dom.detailMeta.textContent = `${formatBytes(game.sizeOnDisk)} · Son oynama: ${formatDate(game.lastPlayed)}`;
    if (dom.detailImage) {
      dom.detailImage.src = game.image || '';
      dom.detailImage.alt = game.name;
    }
    if (dom.noteInput) dom.noteInput.value = game.note || '';
    dom.detailPanel.classList.remove('hidden');
    dom.detailPanel.setAttribute('aria-hidden', 'false');
  }

  function closeDetail() {
    state.selectedAppId = null;
    if (!dom.detailPanel) return;
    dom.detailPanel.classList.add('hidden');
    dom.detailPanel.setAttribute('aria-hidden', 'true');
  }

  async function loadLibrary(refresh = false) {
    setStatus(refresh ? 'Kütüphane yeniden taranıyor…' : 'Kütüphane taranıyor…');
    try {
      const snapshot = refresh ? await api.refreshLibrary() : await api.getLibrary();
      state.games = Array.isArray(snapshot?.games) ? snapshot.games : [];
      state.info = state.info || {};

      if (dom.steamRoot) {
        dom.steamRoot.textContent = snapshot?.steamRoot
          ? `Steam klasörü: ${snapshot.steamRoot}`
          : 'Steam kurulumu bulunamadı';
      }

      renderLibrary();
      setStatus(
        state.games.length
          ? `${state.games.length} oyun bulundu · ${state.games.filter((game) => game.installed).length} tanesi kurulu`
          : ''
      );
    } catch (error) {
      setStatus('Kütüphane okunamadı');
      toast(`Kütüphane okunamadı: ${error && error.message ? error.message : error}`, true);
    }
  }

  async function runStoreSearch(query) {
    if (!query || query.trim().length < 2) {
      renderStoreResults([]);
      return;
    }
    try {
      const result = await api.search(query);
      renderStoreResults(result && Array.isArray(result.store) ? result.store : []);
    } catch {
      renderStoreResults([]);
    }
  }


  async function handleFavorite(appid) {
    try {
      const result = await api.toggleFavorite(appid);
      const game = state.games.find((item) => item.appid === String(appid));
      if (game) game.favorite = Boolean(result && result.favorite);
      renderLibrary();
    } catch (error) {
      toast('Favori güncellenemedi', true);
    }
  }

  async function handleLaunch(appid) {
    try {
      await api.launch(appid);
      toast('Steam üzerinden başlatılıyor…');
    } catch (error) {
      toast(`Oyun başlatılamadı: ${error && error.message ? error.message : error}`, true);
    }
  }

  async function handleSaveNote() {
    if (!state.selectedAppId || !dom.noteInput) return;
    try {
      const result = await api.setNote(state.selectedAppId, dom.noteInput.value);
      const game = state.games.find((item) => item.appid === String(state.selectedAppId));
      if (game) game.note = result && typeof result.note === 'string' ? result.note : '';
      toast('Not kaydedildi');
    } catch {
      toast('Not kaydedilemedi', true);
    }
  }

  function bindEvents() {
    if (dom.refreshBtn) {
      dom.refreshBtn.addEventListener('click', () => loadLibrary(true));
    }

    if (dom.searchInput) {
      dom.searchInput.addEventListener('input', (event) => {
        state.query = event.target.value || '';
        renderLibrary();

        clearTimeout(state.searchTimer);
        const query = state.query;
        state.searchTimer = setTimeout(() => runStoreSearch(query), 400);
      });
    }

    if (dom.filterBar) {
      dom.filterBar.addEventListener('click', (event) => {
        const button = event.target.closest('[data-filter]');
        if (!button) return;
        state.filter = button.dataset.filter;
        for (const chip of dom.filterBar.querySelectorAll('.chip')) {
          chip.classList.toggle('active', chip === button);
        }
        renderLibrary();
      });
    }

    if (dom.gameGrid) {
      dom.gameGrid.addEventListener('click', (event) => {
        const action = event.target.closest('[data-action]');
        const card = event.target.closest('.card');
        if (!card) return;
        const appid = card.dataset.appid;

        if (!action) {
          openDetail(appid);
          return;
        }

        if (action.dataset.action === 'favorite') handleFavorite(appid);
        else if (action.dataset.action === 'launch') handleLaunch(appid);
        else if (action.dataset.action === 'details') openDetail(appid);
      });
    }

    if (dom.detailClose) dom.detailClose.addEventListener('click', closeDetail);
    if (dom.noteSaveBtn) dom.noteSaveBtn.addEventListener('click', handleSaveNote);
    if (dom.launchBtn) {
      dom.launchBtn.addEventListener('click', () => {
        if (state.selectedAppId) handleLaunch(state.selectedAppId);
      });
    }

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeDetail();
    });
  }

  async function loadAppInfo() {
    try {
      const info = await api.getAppInfo();
      if (dom.appVersion && info && info.version) dom.appVersion.textContent = `v${info.version}`;
    } catch {
      // surum bilgisi kritik degil
    }
  }

  function init() {
    cacheDom();
    bindEvents();
    loadAppInfo();
    loadLibrary(false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Testler ve hata ayiklama icin kucuk bir kanca
  window.__steamKutuphanem = {
    state,
    visibleGames,
    renderLibrary,
    openDetail,
    closeDetail
  };
})();

