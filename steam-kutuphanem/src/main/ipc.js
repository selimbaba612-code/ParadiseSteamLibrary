'use strict';

/**
 * IPC kanallarinin tek kaynagi. Electron'a bagimli degildir: testlerde sahte
 * bir ipcMain nesnesi verilerek tum kanallar dogrulanabilir.
 */

const CHANNELS = {
  libraryGet: 'library:get',
  libraryRefresh: 'library:refresh',
  storeSearch: 'store:search',
  toggleFavorite: 'data:toggle-favorite',
  setNote: 'data:set-note',
  launch: 'game:launch',
  appInfo: 'app:info'
};

/**
 * @param {object} options
 * @param {{handle: Function}} options.ipcMain       Electron ipcMain (veya sahte)
 * @param {object} options.service                   LibraryService ornegi
 * @param {Function} [options.launchUri]             steam://... adresini acan fonksiyon
 * @param {Function} [options.getVersion]            uygulama surumunu donen fonksiyon
 * @param {Function} [options.getSteamRoot]          tespit edilen Steam klasoru
 */
function registerIpcHandlers({ ipcMain, service, launchUri, getVersion = () => '0.1.0', getSteamRoot }) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') throw new Error('ipcMain gerekli');
  if (!service) throw new Error('service gerekli');

  const handlers = {
    [CHANNELS.libraryGet]: async () => service.getState(),
    [CHANNELS.libraryRefresh]: async () => service.refresh(),
    [CHANNELS.storeSearch]: async (term) => service.search(term),
    [CHANNELS.toggleFavorite]: async (appid) => service.toggleFavorite(appid),
    [CHANNELS.setNote]: async (appid, note) => service.setNote(appid, note),
    [CHANNELS.appInfo]: async () => ({
      version: getVersion(),
      steamRoot: getSteamRoot ? await getSteamRoot() : null
    }),
    [CHANNELS.launch]: async (appid) => {
      const uri = await service.buildLaunchUri(appid);
      if (typeof launchUri !== 'function') throw new Error('Baslatici tanimli degil');
      await launchUri(uri);
      return { ok: true, uri };
    }
  };

  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, (event, ...args) => handler(...args));
  }

  return CHANNELS;
}

module.exports = { CHANNELS, registerIpcHandlers };
