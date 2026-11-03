/* Steam Kütüphanem — arayüz (Paradise sürümü)
   contextIsolation açık: sadece window.api kullanılır. */
(function () {
  'use strict';

  const api = window.api;
  const dom = {};

  const state = {
    user: null,
    authMode: 'login',
    view: 'library',
    games: [],
    filter: 'all',
    query: '',
    selectedAppId: null,
    info: null,
    searchTimer: null,
    freePage: 0,
    freeItems: [],
    featuredLoaded: false
  };

  const FREE_PAGE_SIZE = 30;

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
      return new Date(value * 1000).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return '—';
    }
  }

  function cacheDom() {
    const ids = [
      'authScreen', 'authTabLogin', 'authTabRegister', 'authForm', 'authUsername', 'authPassword',
      'authSubmit', 'authError', 'authGuest', 'appShell', 'steamRoot', 'searchInput', 'refreshBtn',
      'userName', 'logoutBtn', 'navLibrary', 'navStore', 'navFree', 'sizeInfo', 'libraryView',
      'storeView', 'filterBar', 'countAll', 'countInstalled', 'countFavorites', 'statusBar',
      'gameGrid', 'storeSearchSection', 'storeSearchGrid', 'freeSection', 'freeGrid', 'freeMoreBtn',
      'featuredSection', 'featuredSections', 'detailPanel', 'detailClose', 'detailImage',
      'detailTitle', 'detailMeta', 'noteInput', 'noteSaveBtn', 'launchBtn', 'toast', 'appVersion'
    ];
    for (const id of ids) dom[id] = document.getElementById(id);
  }

  function setStatus(text) {
    if (!dom.statusBar) return;
    dom.statusBar.textContent = text || '';
    dom.statusBar.classList.toggle('hidden', !text);
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

  function badge(text, extraClass = '') {
    const span = document.createElement('span');
    span.className = `badge${extraClass ? ` ${extraClass}` : ''}`;
    span.textContent = text;
    return span;
  }

  function buildImage(src, alt) {
    const image = document.createElement('img');
    image.alt = alt || '';
    image.loading = 'lazy';
    if (src) image.src = src;
    image.addEventListener('error', () => image.removeAttribute('src'));
    return image;
  }

  /** Kütüphanedeki oyun kartı (favori, oyna, detay). */
  function createGameCard(game) {
    const card = document.createElement('article');
    card.className = 'card';
    card.dataset.appid = String(game.appid);
    card.appendChild(buildImage(game.image, game.name));

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
    const size = document.createElement('span');
    size.textContent = formatBytes(game.sizeOnDisk);
    meta.appendChild(size);
    const played = document.createElement('span');
    played.textContent = formatDate(game.lastPlayed);
    meta.appendChild(played);
    if (!game.installed) meta.appendChild(badge('Kurulu değil'));
    body.appendChild(meta);

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

    card.appendChild(body);
    return card;
  }

  /** Mağaza kartı: fiyat/bedava etiketi + Steam kısayolları. */
  function createStoreCard(item) {
    const card = document.createElement('article');
    card.className = 'card';
    card.dataset.appid = String(item.appid);
    card.appendChild(buildImage(item.image, item.name));

    const body = document.createElement('div');
    body.className = 'card-body';

    const title = document.createElement('h3');
    title.textContent = item.name || `Oyun ${item.appid}`;
    body.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'card-meta';
    if (item.free) meta.appendChild(badge('Bedava', 'free'));
    if (item.discountText) meta.appendChild(badge(item.discountText, 'discount'));
    if (item.priceText && !item.free) {
      const price = document.createElement('span');
      price.textContent = item.priceText;
      meta.appendChild(price);
    }
    body.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const openPage = document.createElement('button');
    openPage.type = 'button';
    openPage.className = 'btn';
    openPage.dataset.action = 'store-page';
    openPage.textContent = 'Steam sayfası';
    actions.appendChild(openPage);

    if (item.free) {
      const install = document.createElement('button');
      install.type = 'button';
      install.className = 'btn primary';
      install.dataset.action = 'install';
      install.textContent = "Steam'de al";
      actions.appendChild(install);
    }

    body.appendChild(actions);
    card.appendChild(body);
    return card;
  }


  // ---------------- Kütüphane ----------------

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

  function renderLibrary() {
    if (!dom.gameGrid) return;
    dom.gameGrid.textContent = '';

    if (dom.countAll) dom.countAll.textContent = String(state.games.length);
    if (dom.countInstalled) dom.countInstalled.textContent = String(state.games.filter((game) => game.installed).length);
    if (dom.countFavorites) dom.countFavorites.textContent = String(state.games.filter((game) => game.favorite).length);
    if (dom.sizeInfo) {
      const total = state.games.reduce((sum, game) => sum + (Number(game.sizeOnDisk) || 0), 0);
      dom.sizeInfo.textContent = state.games.length ? `Toplam ${formatBytes(total)}` : '';
    }

    const games = visibleGames();
    if (!games.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = state.games.length
        ? 'Bu filtreye uyan oyun yok.'
        : 'Kütüphanede oyun bulunamadı. Steam kurulu mu?';
      dom.gameGrid.appendChild(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const game of games) fragment.appendChild(createGameCard(game));
    dom.gameGrid.appendChild(fragment);
  }

  // ---------------- Mağaza ----------------

  function renderStoreSearch(items) {
    if (!dom.storeSearchGrid || !dom.storeSearchSection) return;
    dom.storeSearchGrid.textContent = '';

    if (!Array.isArray(items) || !items.length) {
      dom.storeSearchSection.classList.add('hidden');
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const item of items) fragment.appendChild(createStoreCard(item));
    dom.storeSearchGrid.appendChild(fragment);
    dom.storeSearchSection.classList.remove('hidden');
  }

  function renderFreeGames() {
    if (!dom.freeGrid) return;
    dom.freeGrid.textContent = '';

    if (!state.freeItems.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'Bedava oyunlar yükleniyor…';
      dom.freeGrid.appendChild(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const item of state.freeItems) fragment.appendChild(createStoreCard(item));
    dom.freeGrid.appendChild(fragment);

    if (dom.freeMoreBtn) {
      dom.freeMoreBtn.classList.toggle('hidden', !state.freeHasMore);
    }
  }

  function renderFeatured(sections) {
    if (!dom.featuredSections) return;
    dom.featuredSections.textContent = '';

    if (!Array.isArray(sections) || !sections.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'Öne çıkan oyunlar alınamadı (internet bağlantısı?).';
      dom.featuredSections.appendChild(empty);
      return;
    }

    for (const section of sections) {
      const row = document.createElement('div');
      row.className = 'featured-row';

      const title = document.createElement('h3');
      title.textContent = section.title;
      row.appendChild(title);

      const grid = document.createElement('div');
      grid.className = 'grid small';
      for (const item of section.items) grid.appendChild(createStoreCard(item));
      row.appendChild(grid);

      dom.featuredSections.appendChild(row);
    }
  }

  async function loadFeatured(force = false) {
    if (state.featuredLoaded && !force) return;
    try {
      const sections = await api.getFeatured();
      state.featuredLoaded = true;
      renderFeatured(sections);
    } catch {
      renderFeatured([]);
    }
  }

  async function loadFreeGames(reset = false) {
    if (reset) {
      state.freePage = 0;
      state.freeItems = [];
    }

    try {
      const result = await api.browseCatalog({ freeOnly: true, page: state.freePage, pageSize: FREE_PAGE_SIZE });
      const items = result && Array.isArray(result.items) ? result.items : [];
      state.freeItems = state.freeItems.concat(items);
      state.freeHasMore = Boolean(result && result.hasMore);
      state.freePage += 1;
      renderFreeGames();
    } catch (error) {
      state.freeHasMore = false;
      renderFreeGames();
      toast('Bedava oyunlar alınamadı', true);
    }
  }


  // ---------------- Hesap / oturum ----------------

  function showAuthError(message) {
    if (!dom.authError) return;
    dom.authError.textContent = message || '';
    dom.authError.classList.toggle('hidden', !message);
  }

  function setAuthMode(mode) {
    state.authMode = mode;
    if (dom.authTabLogin) dom.authTabLogin.classList.toggle('active', mode === 'login');
    if (dom.authTabRegister) dom.authTabRegister.classList.toggle('active', mode === 'register');
    if (dom.authSubmit) dom.authSubmit.textContent = mode === 'login' ? 'Giriş yap' : 'Kayıt ol';
    showAuthError('');
  }

  function showAuthScreen() {
    state.user = null;
    if (dom.appShell) dom.appShell.classList.add('hidden');
    if (dom.authScreen) dom.authScreen.classList.remove('hidden');
    if (dom.authPassword) dom.authPassword.value = '';
  }

  async function enterApp(session) {
    state.user = session && session.username ? session.username : null;
    if (dom.authScreen) dom.authScreen.classList.add('hidden');
    if (dom.appShell) dom.appShell.classList.remove('hidden');
    if (dom.userName) dom.userName.textContent = state.user || 'misafir';

    await loadAppInfo();
    await loadLibrary(false);
    await loadFeatured();
    await loadFreeGames(true);
    switchView('library');
  }

  async function handleAuthSubmit(event) {
    if (event && event.preventDefault) event.preventDefault();
    if (!api || typeof api.login !== 'function') return;

    const username = dom.authUsername ? dom.authUsername.value.trim() : '';
    const password = dom.authPassword ? dom.authPassword.value : '';

    showAuthError('');
    try {
      const session = state.authMode === 'login'
        ? await api.login(username, password)
        : await api.register(username, password);
      await enterApp(session);
    } catch (error) {
      showAuthError((error && error.message) || 'İşlem başarısız');
    }
  }

  async function handleLogout() {
    try {
      await api.logout();
    } catch {
      // oturum zaten kapali olabilir
    }
    state.games = [];
    state.freeItems = [];
    state.featuredLoaded = false;
    if (dom.gameGrid) dom.gameGrid.textContent = '';
    if (dom.authUsername) dom.authUsername.value = '';
    showAuthScreen();
  }

  // ---------------- Detay paneli ----------------

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

  // ---------------- Kütüphane yükleme ----------------

  async function loadLibrary(refresh = false) {
    setStatus(refresh ? 'Kütüphane yeniden taranıyor…' : 'Kütüphane taranıyor…');
    try {
      const snapshot = refresh ? await api.refreshLibrary() : await api.getLibrary();
      state.games = Array.isArray(snapshot?.games) ? snapshot.games : [];

      if (dom.steamRoot) {
        dom.steamRoot.textContent = snapshot?.steamRoot
          ? `Steam klasörü: ${snapshot.steamRoot}`
          : 'Steam kurulumu bulunamadı';
      }

      renderLibrary();
      setStatus(state.games.length
        ? `${state.games.length} oyun bulundu · ${state.games.filter((game) => game.installed).length} tanesi kurulu`
        : '');
    } catch (error) {
      setStatus('Kütüphane okunamadı');
      toast(`Kütüphane okunamadı: ${(error && error.message) || error}`, true);
    }
  }

  async function loadAppInfo() {
    try {
      const info = await api.getAppInfo();
      state.info = info;
      if (dom.appVersion && info && info.version) dom.appVersion.textContent = `v${info.version}`;
    } catch {
      // surum bilgisi kritik degil
    }
  }


  // ---------------- Görünüm / sekmeler ----------------

  function switchView(view) {
    state.view = view;
    const showStore = view === 'store' || view === 'free';

    if (dom.libraryView) dom.libraryView.classList.toggle('hidden', showStore);
    if (dom.storeView) dom.storeView.classList.toggle('hidden', !showStore);
    if (dom.navLibrary) dom.navLibrary.classList.toggle('active', view === 'library');
    if (dom.navStore) dom.navStore.classList.toggle('active', view === 'store');
    if (dom.navFree) dom.navFree.classList.toggle('active', view === 'free');

    if (dom.freeSection) dom.freeSection.classList.toggle('hidden', view !== 'free');
    if (dom.featuredSection) dom.featuredSection.classList.toggle('hidden', view !== 'store');

    if (view === 'store') loadFeatured();
    if (view === 'free' && !state.freeItems.length) loadFreeGames(true);
  }

  // ---------------- Eylemler ----------------

  async function handleFavorite(appid) {
    try {
      const result = await api.toggleFavorite(appid);
      const game = state.games.find((item) => item.appid === String(appid));
      if (game) game.favorite = Boolean(result && result.favorite);
      renderLibrary();
    } catch (error) {
      toast('Favori güncellenemedi (giriş yapmalısın)', true);
    }
  }

  async function handleLaunch(appid) {
    try {
      await api.launch(appid);
      toast('Steam üzerinden başlatılıyor…');
    } catch (error) {
      toast(`Oyun başlatılamadı: ${(error && error.message) || error}`, true);
    }
  }

  async function handleStorePage(appid) {
    try {
      await api.openStorePage(appid);
    } catch {
      toast('Steam sayfası açılamadı', true);
    }
  }

  async function handleInstallFree(appid) {
    try {
      await api.installFree(appid);
      toast("Steam'de 'Kütüphaneye ekle' penceresi açıldı");
    } catch {
      toast('Steam açılamadı', true);
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


  // ---------------- Olaylar ----------------

  function bindGridActions(grid, handlers) {
    if (!grid) return;
    grid.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]');
      const card = event.target.closest('.card');
      if (!card) return;
      const appid = card.dataset.appid;

      if (!action) {
        if (handlers.open) handlers.open(appid);
        return;
      }
      const handler = handlers[action.dataset.action];
      if (handler) handler(appid);
    });
  }

  function bindEvents() {
    if (dom.authTabLogin) dom.authTabLogin.addEventListener('click', () => setAuthMode('login'));
    if (dom.authTabRegister) dom.authTabRegister.addEventListener('click', () => setAuthMode('register'));
    if (dom.authForm) dom.authForm.addEventListener('submit', handleAuthSubmit);
    if (dom.authGuest) dom.authGuest.addEventListener('click', () => enterApp({ username: null }));
    if (dom.logoutBtn) dom.logoutBtn.addEventListener('click', handleLogout);

    if (dom.navLibrary) dom.navLibrary.addEventListener('click', () => switchView('library'));
    if (dom.navStore) dom.navStore.addEventListener('click', () => switchView('store'));
    if (dom.navFree) dom.navFree.addEventListener('click', () => switchView('free'));

    if (dom.refreshBtn) dom.refreshBtn.addEventListener('click', () => loadLibrary(true));
    if (dom.freeMoreBtn) dom.freeMoreBtn.addEventListener('click', () => loadFreeGames(false));

    if (dom.searchInput) {
      dom.searchInput.addEventListener('input', (event) => {
        state.query = event.target.value || '';
        renderLibrary();

        clearTimeout(state.searchTimer);
        const query = state.query.trim();
        state.searchTimer = setTimeout(async () => {
          if (query.length < 2) {
            renderStoreSearch([]);
            return;
          }
          try {
            const result = await api.browseCatalog({ query, page: 0, pageSize: 30 });
            renderStoreSearch(result && result.items ? result.items : []);
          } catch {
            renderStoreSearch([]);
          }
        }, 400);
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

    bindGridActions(dom.gameGrid, {
      open: openDetail,
      favorite: handleFavorite,
      launch: handleLaunch,
      details: openDetail
    });
    bindGridActions(dom.storeSearchGrid, { 'store-page': handleStorePage, install: handleInstallFree });
    bindGridActions(dom.freeGrid, { 'store-page': handleStorePage, install: handleInstallFree });
    bindGridActions(dom.featuredSections, { 'store-page': handleStorePage, install: handleInstallFree });

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

  async function init() {
    cacheDom();
    bindEvents();
    setAuthMode('login');

    try {
      const status = await api.getAuthStatus();
      if (status && status.username) await enterApp(status);
      else showAuthScreen();
    } catch {
      showAuthScreen();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Testler / hata ayiklama icin kanca
  window.__steamKutuphanem = {
    state,
    visibleGames,
    renderLibrary,
    renderFreeGames,
    renderFeatured,
    renderStoreSearch,
    switchView,
    enterApp,
    openDetail,
    closeDetail,
    handleAuthSubmit
  };
})();

