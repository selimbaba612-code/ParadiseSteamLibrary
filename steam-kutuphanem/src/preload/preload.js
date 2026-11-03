'use strict';

/**
 * Renderer ile ana surec arasindaki tek kopru.
 * contextIsolation acik oldugu icin renderer'in Node.js erisimi yoktur;
 * sadece asagidaki fonksiyonlar paylasilir.
 */

const { contextBridge, ipcRenderer } = require('electron');

const api = {
  getLibrary: () => ipcRenderer.invoke('library:get'),
  refreshLibrary: () => ipcRenderer.invoke('library:refresh'),
  search: (term) => ipcRenderer.invoke('store:search', term),
  toggleFavorite: (appid) => ipcRenderer.invoke('data:toggle-favorite', appid),
  setNote: (appid, note) => ipcRenderer.invoke('data:set-note', appid, note),
  launch: (appid) => ipcRenderer.invoke('game:launch', appid),
  getAppInfo: () => ipcRenderer.invoke('app:info')
};

contextBridge.exposeInMainWorld('api', api);
