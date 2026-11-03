/**
 * Paradise Steam Library - main process smoke test
 *
 * Electron is not available inside CI/sandbox environments, so this test
 * replaces the `electron` module with a lightweight in-memory stub and
 * exercises the real IPC handlers that the renderer uses.
 *
 * Run with: npm test
 */
const Module = require('module');
const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const assert = require('assert');
const AdmZip = require('adm-zip');

// ---------------------------------------------------------------------------
// Isolated home directory so the app never touches the real user profile
// ---------------------------------------------------------------------------
const sandboxHome = fs.mkdtempSync(path.join(os.tmpdir(), 'psl-home-'));
process.env.HOME = sandboxHome;
process.env.USERPROFILE = sandboxHome;
process.env.APPDATA = path.join(sandboxHome, 'AppData', 'Roaming');
process.env.LOCALAPPDATA = path.join(sandboxHome, 'AppData', 'Local');

// ---------------------------------------------------------------------------
// Electron stub
// ---------------------------------------------------------------------------
const handlers = new Map();
const duplicateHandlers = [];
const unhandledRejections = [];
process.on('unhandledRejection', (reason) => unhandledRejections.push(reason));
const sentEvents = [];
const shellCalls = [];
const appListeners = {};
let dialogResponse = { canceled: true, filePaths: [] };

class FakeWebContents {
  send(channel, payload) {
    sentEvents.push({ channel, payload });
  }
}

class FakeBrowserWindow {
  constructor(options) {
    this.options = options || {};
    this.webContents = new FakeWebContents();
    this.maximized = false;
    this.closed = false;
    this.shown = false;
    FakeBrowserWindow.instances.push(this);
  }
  loadFile(file) {
    this.loadedFile = file;
    // Used by the "config is ready before the window opens" check
    this.configExistedAtLoad = fs.existsSync(
      path.join(sandboxHome, 'AppData', 'Local', 'paradisedev', 'config.json')
    );
    return Promise.resolve(true);
  }
  once() { return this; }
  on() { return this; }
  show() { this.shown = true; }
  minimize() { this.minimized = true; }
  maximize() { this.maximized = true; }
  unmaximize() { this.maximized = false; }
  isMaximized() { return this.maximized; }
  close() { this.closed = true; }
}
FakeBrowserWindow.instances = [];
FakeBrowserWindow.getAllWindows = () => FakeBrowserWindow.instances;

const electronStub = {
  app: {
    whenReady: () => Promise.resolve(),
    getVersion: () => '2.0.3',
    getName: () => 'Paradise Steam Library',
    getPath: () => sandboxHome,
    on: (event, fn) => {
      if (!appListeners[event]) appListeners[event] = [];
      appListeners[event].push(fn);
    },
    quit: () => {},
    setAppUserModelId: () => {}
  },
  BrowserWindow: FakeBrowserWindow,
  ipcMain: {
    handle(channel, fn) {
      if (handlers.has(channel)) {
        // Aynı kanalı ikinci kez kaydetmek gerçek Electron'da hata fırlatır
        duplicateHandlers.push(channel);
        return;
      }
      handlers.set(channel, fn);
    },
    on() {},
    removeHandler(channel) { handlers.delete(channel); }
  },
  dialog: {
    showOpenDialog: async () => dialogResponse,
    showMessageBox: async () => ({ response: 0 })
  },
  shell: {
    openExternal: async (url) => { shellCalls.push(url); }
  },
  Menu: { setApplicationMenu: () => {} }
};

const originalLoad = Module._load;
Module._load = function (request) {
  if (request === 'electron') return electronStub;
  return originalLoad.apply(this, arguments);
};

// ---------------------------------------------------------------------------
// Tiny assertion helpers
// ---------------------------------------------------------------------------
const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  PASS  ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error });
    console.log(`  FAIL  ${name}`);
    console.log(`        ${error && error.message}`);
  }
}

function invoke(channel, ...args) {
  if (!handlers.has(channel)) throw new Error(`IPC handler not registered: ${channel}`);
  return handlers.get(channel)({ sender: {} }, ...args);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function makeZip(entries) {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(entries)) {
    zip.addFile(name, Buffer.from(content, 'utf8'));
  }
  return zip.toBuffer();
}


// ---------------------------------------------------------------------------
// Test run
// ---------------------------------------------------------------------------
(async function run() {
  console.log('\nParadise Steam Library - main process smoke test');
  console.log(`Home directory: ${sandboxHome}\n`);

  await check('main process boots and creates the window', async () => {
    require('../src/main.js');
    await new Promise((resolve) => setTimeout(resolve, 800));
    assert.strictEqual(FakeBrowserWindow.instances.length, 1, 'expected exactly one BrowserWindow');
    const win = FakeBrowserWindow.instances[0];
    assert.strictEqual(win.loadedFile, path.join('src', 'renderer', 'index.html'));
    assert.strictEqual(win.options.webPreferences.nodeIntegration, true);
    assert.ok(win.configExistedAtLoad, 'window opened before the config was loaded');
  });

  await check('registers every IPC channel used by the renderer', async () => {
    const renderer = await fs.readFile(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');
    const used = new Set();
    const re = /ipcRenderer\.invoke\(\s*'([^']+)'/g;
    let match;
    while ((match = re.exec(renderer)) !== null) used.add(match[1]);
    assert.ok(used.size > 0, 'no ipcRenderer.invoke calls found in renderer');
    const missing = [...used].filter((channel) => !handlers.has(channel));
    assert.deepStrictEqual(missing, [], `missing handlers: ${missing.join(', ')}`);
  });

  await check('get-config returns defaults', async () => {
    const config = await invoke('get-config');
    assert.strictEqual(config.theme, 'dark');
    assert.strictEqual(config.steamPath, '');
    assert.strictEqual(config.apiCooldown, 1000);
  });

  await check('save-config merges and persists settings', async () => {
    const saved = await invoke('save-config', { theme: 'light' });
    assert.strictEqual(saved.theme, 'light');
    assert.strictEqual(saved.discordRPC, true, 'existing keys must be preserved');
    const configPath = path.join(sandboxHome, 'AppData', 'Local', 'paradisedev', 'config.json');
    assert.ok(await fs.pathExists(configPath), 'config.json was not written');
    const onDisk = await fs.readJson(configPath);
    assert.strictEqual(onDisk.theme, 'light');
  });

  // Fake Steam installation used by the library related tests
  const steamPath = path.join(sandboxHome, 'Steam');
  await fs.ensureDir(steamPath);
  await fs.writeFile(path.join(steamPath, 'steam.exe'), 'fake');

  await check('select-steam-path rejects folders without steam.exe', async () => {
    const empty = path.join(sandboxHome, 'empty');
    await fs.ensureDir(empty);
    dialogResponse = { canceled: false, filePaths: [empty] };
    await assert.rejects(() => invoke('select-steam-path'), /steam\.exe/);
  });

  await check('select-steam-path stores a valid Steam folder', async () => {
    dialogResponse = { canceled: false, filePaths: [steamPath] };
    const selected = await invoke('select-steam-path');
    assert.strictEqual(selected, steamPath);
    assert.ok(await fs.pathExists(path.join(steamPath, 'config', 'stplug-in')), 'stplug-in folder missing');
    assert.ok(await fs.pathExists(path.join(steamPath, 'config', 'depotcache')), 'depotcache folder missing');
  });

  await check('install-manual-game rejects non-zip files', async () => {
    const badFile = path.join(sandboxHome, 'not-a-zip.zip');
    await fs.writeFile(badFile, Buffer.alloc(4096, 0x41));
    await assert.rejects(() => invoke('install-manual-game', { file: badFile }), /ZIP/);
  });

  await check('install-manual-game extracts .lua and .manifest files', async () => {
    const zipFile = path.join(sandboxHome, 'manual.zip');
    // Random bytes keep the archive above the 1000 byte sanity limit
    const padding = require('crypto').randomBytes(4096).toString('hex');
    await fs.writeFile(zipFile, makeZip({
      '1234560.lua': `addappid(1234560)\n-- ${padding}\n`,
      'depot-1234561.manifest': 'manifest-data'
    }));

    const result = await invoke('install-manual-game', { file: zipFile });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.gameInfo.appId, '1234560');

    const luaPath = path.join(steamPath, 'config', 'stplug-in', '1234560.lua');
    const manifestPath = path.join(steamPath, 'config', 'depotcache', 'depot-1234561.manifest');
    assert.ok(await fs.pathExists(luaPath), `.lua was not extracted to ${luaPath}`);
    assert.ok(await fs.pathExists(manifestPath), `.manifest was not extracted to ${manifestPath}`);
    assert.ok((await fs.readFile(luaPath, 'utf8')).includes('addappid(1234560)'));
  });

  await check('delete-game removes the lua file from the library', async () => {
    const result = await invoke('delete-game', '1234560');
    assert.strictEqual(result.success, true);
    assert.ok(!(await fs.pathExists(path.join(steamPath, 'config', 'stplug-in', '1234560.lua'))));
  });

  await check('get-library-games lists installed app ids', async () => {
    await fs.writeFile(path.join(steamPath, 'config', 'stplug-in', '220.lua'), 'addappid(220)\n');
    await fs.writeFile(path.join(steamPath, 'config', 'stplug-in', 'marcellus.lua'), '-- shared\n');
    const games = await invoke('get-library-games');
    assert.ok(Array.isArray(games));
    // The Steam API may be unreachable from the sandbox, so the list can stay empty;
    // marcellus.lua must never be reported as a game though.
    assert.ok(!games.some((g) => String(g.appid) === 'marcellus'));
  });

  await check('window controls talk to the BrowserWindow', async () => {
    const win = FakeBrowserWindow.instances[0];
    await invoke('window-maximize');
    assert.strictEqual(win.maximized, true);
    await invoke('window-maximize');
    assert.strictEqual(win.maximized, false);
    await invoke('window-minimize');
    assert.strictEqual(win.minimized, true);
    await invoke('window-close');
    assert.strictEqual(win.closed, true);
  });

  await check('external links are opened through the shell', async () => {
    await invoke('open-external', 'https://store.steampowered.com');
    assert.deepStrictEqual(shellCalls, ['https://store.steampowered.com']);
  });

  await check('recreates the window after all windows are closed', async () => {
    const activate = appListeners['activate'] || [];
    assert.strictEqual(activate.length, 1, "'activate' listener is not registered");
    // Simulate a closed window (macOS dock click)
    FakeBrowserWindow.instances.length = 0;
    await activate[0]();
    assert.strictEqual(FakeBrowserWindow.instances.length, 1, 'window was not recreated');
    // IPC handlers must still be usable (no duplicate handler registration)
    const config = await invoke('get-config');
    assert.strictEqual(config.steamPath, steamPath, 'config was not preserved across windows');
  });

  await check('no duplicate IPC handlers and no unhandled rejections', async () => {
    await wait(300);
    assert.deepStrictEqual(duplicateHandlers, [], `duplicate IPC handlers: ${duplicateHandlers.join(', ')}`);
    assert.deepStrictEqual(
      unhandledRejections.map((r) => (r && r.message) || String(r)),
      [],
      `unhandled rejections: ${unhandledRejections.map((r) => (r && r.message) || String(r)).join(' | ')}`
    );
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed\n`);

  Module._load = originalLoad;
  await fs.remove(sandboxHome);
  process.exit(failed.length === 0 ? 0 : 1);
})().catch(async (error) => {
  console.error('\nUnexpected failure:', error);
  await fs.remove(sandboxHome).catch(() => {});
  process.exit(1);
});

