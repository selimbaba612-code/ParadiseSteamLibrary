'use strict';

const path = require('path');
const { app, BrowserWindow, ipcMain, shell } = require('electron');

const { AccountStore } = require('./accounts');
const { UserContext } = require('./user-context');
const { LibraryService } = require('./library-service');
const { registerIpcHandlers } = require('./ipc');

const WINDOW_OPTIONS = {
  width: 1320,
  height: 860,
  minWidth: 1000,
  minHeight: 660,
  title: 'Steam Kütüphanem',
  backgroundColor: '#0d0716',
  show: false,
  webPreferences: {
    preload: path.join(__dirname, '..', 'preload', 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true
  }
};

class SteamKutuphanemApp {
  constructor() {
    this.mainWindow = null;
    this.ipcReady = false;

    const userDataDir = app.getPath('userData');
    this.accounts = new AccountStore(path.join(userDataDir, 'accounts.json'));
    this.context = new UserContext({
      accounts: this.accounts,
      dataDir: userDataDir,
      createService: (userDataStore) => new LibraryService({ userDataStore })
    });
    this.ready = this.init();
  }

  async init() {
    await this.context.ready;
  }

  async createWindow() {
    await this.ready;

    this.mainWindow = new BrowserWindow(WINDOW_OPTIONS);
    await this.mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow.show();
      if (process.argv.includes('--dev')) this.mainWindow.webContents.openDevTools();
    });

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });

    this.setupIpc();
  }

  setupIpc() {
    // Handler'lar global ipcMain'e kaydedilir; ikinci kez kaydetmek hata verir
    if (this.ipcReady) return;
    this.ipcReady = true;

    registerIpcHandlers({
      ipcMain,
      context: this.context,
      launchUri: (uri) => shell.openExternal(uri),
      getVersion: () => app.getVersion(),
      getSteamRoot: () => this.context.service().resolveSteamRoot()
    });
  }
}

let steamApp = null;

async function getApp() {
  if (!steamApp) {
    steamApp = new SteamKutuphanemApp();
    await steamApp.ready;
  }
  return steamApp;
}

app.whenReady().then(async () => {
  const instance = await getApp();
  await instance.createWindow();
}).catch((error) => {
  console.error('Uygulama baslatilamadi:', error);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    try {
      const instance = await getApp();
      await instance.createWindow();
    } catch (error) {
      console.error('Pencere yeniden acilamadi:', error);
    }
  }
});

module.exports = { SteamKutuphanemApp, getApp };
