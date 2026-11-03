'use strict';

/**
 * IPC kanallarinin tek kaynagi. Electron'a bagimli degildir: testlerde sahte
 * bir ipcMain nesnesi verilerek tum kanallar dogrulanabilir.
 */

const catalogService = require('./catalog-service');

const CHANNELS = {
  libraryGet: 'library:get',
  libraryRefresh: 'library:refresh',
  storeSearch: 'store:search',
  toggleFavorite: 'data:toggle-favorite',
  setNote: 'data:set-note',
  launch: 'game:launch',
  installFree: 'game:install',
  storePage: 'game:store',
  appInfo: 'app:info',
  authStatus: 'auth:status',
  authRegister: 'auth:register',
  authLogin: 'auth:login',
  authLogout: 'auth:logout',
  catalogFeatured: 'catalog:featured',
  catalogBrowse: 'catalog:browse'
};

/**
 * @param {object} options
 * @param {{handle: Function}} options.ipcMain  Electron ipcMain (veya sahte)
 * @param {object} [options.context]            UserContext (oturum + servis)
 * @param {object} [options.service]            Tek kullanicilik LibraryService (eski imza)
 * @param {object} [options.catalog]            catalog-service yerine kullanilacak nesne
 * @param {Function} [options.launchUri]        steam:// adresini acan fonksiyon
 * @param {Function} [options.getVersion]       uygulama surumu
 * @param {Function} [options.getSteamRoot]     Steam klasoru
 */
function registerIpcHandlers({
  ipcMain,
  context,
  service,
  catalog = catalogService,
  launchUri,
  getVersion = () => '0.1.0',
  getSteamRoot
} = {}) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') throw new Error('ipcMain gerekli');

  const session = context || null;
  const staticService = service || null;
  if (!session && !staticService) throw new Error('context veya service gerekli');

  /** Her cagride aktif kullanicinin servisini dondurur. */
  const currentService = () => (session ? session.service() : staticService);

  const open = async (uri) => {
    if (typeof launchUri !== 'function') throw new Error('Baslatici tanimli degil');
    await launchUri(uri);
    return { ok: true, uri };
  };

  const handlers = {
    [CHANNELS.libraryGet]: async () => currentService().getState(),
    [CHANNELS.libraryRefresh]: async () => currentService().refresh(),
    [CHANNELS.storeSearch]: async (term) => currentService().search(term),
    [CHANNELS.toggleFavorite]: async (appid) => currentService().toggleFavorite(appid),
    [CHANNELS.setNote]: async (appid, note) => currentService().setNote(appid, note),
    [CHANNELS.launch]: async (appid) => open(await currentService().buildLaunchUri(appid)),
    [CHANNELS.installFree]: async (appid) => open(catalog.installUri(appid)),
    [CHANNELS.storePage]: async (appid) => open(catalog.storeUri(appid)),
    [CHANNELS.appInfo]: async () => ({
      version: getVersion(),
      steamRoot: getSteamRoot ? await getSteamRoot() : null
    }),
    [CHANNELS.catalogFeatured]: async () => catalog.getFeatured(),
    [CHANNELS.catalogBrowse]: async (options) => catalog.browse(options || {})
  };

  if (session) {
    handlers[CHANNELS.authStatus] = async () => session.status();
    handlers[CHANNELS.authRegister] = async (username, password) => session.register(username, password);
    handlers[CHANNELS.authLogin] = async (username, password) => session.login(username, password);
    handlers[CHANNELS.authLogout] = async () => session.logout();
  }

  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, (event, ...args) => handler(...args));
  }

  return CHANNELS;
}

module.exports = { CHANNELS, registerIpcHandlers };
