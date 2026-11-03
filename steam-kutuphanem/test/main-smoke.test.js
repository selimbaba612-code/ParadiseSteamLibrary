'use strict';

/**
 * Ana surec dumani testi: Electron yerine bellek ici bir taklit kullanir,
 * gercek main.js'i yukler ve IPC koprusunun calistigini dogrular.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

test('main.js pencereyi acar ve IPC kanallarini kaydeder', async (t) => {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sk-main-'));
  t.after(() => fs.rm(userDataDir, { recursive: true, force: true }));

  const handlers = new Map();
  const duplicates = [];
  const windows = [];
  const opened = [];
  const appListeners = {};

  class FakeBrowserWindow {
    constructor(options) {
      this.options = options;
      this.webContents = { send() {}, openDevTools() {} };
      this.loadedFile = null;
      windows.push(this);
    }
    async loadFile(file) {
      this.loadedFile = file;
      return true;
    }
    once() {}
    on() {}
    show() { this.shown = true; }
  }
  FakeBrowserWindow.getAllWindows = () => windows;

  const electronStub = {
    app: {
      whenReady: () => Promise.resolve(),
      getVersion: () => '0.1.0',
      getPath: () => userDataDir,
      on: (event, fn) => { (appListeners[event] = appListeners[event] || []).push(fn); },
      quit() {}
    },
    BrowserWindow: FakeBrowserWindow,
    ipcMain: {
      handle(channel, fn) {
        if (handlers.has(channel)) {
          duplicates.push(channel);
          return;
        }
        handlers.set(channel, fn);
      }
    },
    shell: { openExternal: async (uri) => opened.push(uri) }
  };

  const originalLoad = Module._load;
  Module._load = function (request) {
    if (request === 'electron') return electronStub;
    return originalLoad.apply(this, arguments);
  };
  t.after(() => { Module._load = originalLoad; });

  const mainPath = require.resolve('../src/main/main.js');
  delete require.cache[mainPath];

  require(mainPath);
  // whenReady + init + window creation async calisir
  await new Promise((resolve) => setTimeout(resolve, 400));

  assert.equal(windows.length, 1, 'tek pencere acilmali');
  const [win] = windows;
  assert.equal(win.options.webPreferences.contextIsolation, true);
  assert.equal(win.options.webPreferences.nodeIntegration, false);
  assert.ok(win.options.webPreferences.preload.endsWith(path.join('preload', 'preload.js')));
  assert.ok(win.loadedFile.endsWith(path.join('renderer', 'index.html')));

  for (const channel of ['library:get', 'library:refresh', 'store:search', 'data:toggle-favorite', 'data:set-note', 'game:launch', 'app:info']) {
    assert.ok(handlers.has(channel), `${channel} kanali kayitli olmali`);
  }

  const state = await handlers.get('library:get')({ sender: {} });
  assert.ok(Array.isArray(state.games), 'kutuphane durumu oyun listesi dondurmeli');

  const info = await handlers.get('app:info')({ sender: {} });
  assert.equal(info.version, '0.1.0');

  const favorite = await handlers.get('data:toggle-favorite')({ sender: {} }, 730);
  assert.equal(favorite.favorite, true);
  const note = await handlers.get('data:set-note')({ sender: {} }, 730, 'deneme notu');
  assert.equal(note.note, 'deneme notu');

  const launch = await handlers.get('game:launch')({ sender: {} }, 730);
  assert.equal(launch.ok, true);
  assert.deepEqual(opened, ['steam://rungameid/730']);

  // Pencere kapatilip yeniden acildiginda IPC kanallari ikinci kez kaydedilmemeli
  windows.length = 0;
  await appListeners.activate[0]();
  assert.equal(windows.length, 1, 'pencere yeniden acilmali');
  assert.deepEqual(duplicates, [], 'IPC kanallari ikinci kez kaydedilmemeli');

  const dataFile = path.join(userDataDir, 'user-data.json');
  const saved = JSON.parse(await fs.readFile(dataFile, 'utf8'));
  assert.deepEqual(saved.favorites, ['730']);
  assert.equal(saved.notes['730'], 'deneme notu');
});
