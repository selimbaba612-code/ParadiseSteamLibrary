'use strict';

/**
 * Renderer ile ana surec arasindaki tek kopru.
 * contextIsolation acik oldugu icin renderer'in Node.js erisimi yoktur;
 * sadece asagidaki fonksiyonlar paylasilir.
 */

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

const api = {
  // Kutuphane
  getLibrary: () => invoke('library:get'),
  refreshLibrary: () => invoke('library:refresh'),
  search: (term) => invoke('store:search', term),
  toggleFavorite: (appid) => invoke('data:toggle-favorite', appid),
  setNote: (appid, note) => invoke('data:set-note', appid, note),
  launch: (appid) => invoke('game:launch', appid),
  openStorePage: (appid) => invoke('game:store', appid),
  installFree: (appid) => invoke('game:install', appid),
  getAppInfo: () => invoke('app:info'),

  // Hesap (yerel)
  getAuthStatus: () => invoke('auth:status'),
  register: (username, password) => invoke('auth:register', username, password),
  login: (username, password) => invoke('auth:login', username, password),
  logout: () => invoke('auth:logout'),

  // Magaza katalogu
  getFeatured: () => invoke('catalog:featured'),
  browseCatalog: (options) => invoke('catalog:browse', options)
};

contextBridge.exposeInMainWorld('api', api);
