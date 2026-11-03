/**
 * Paradise Steam Library - renderer (UI) smoke test
 *
 * Loads the real index.html + renderer.js inside jsdom, with a stubbed Electron
 * IPC bridge and a stubbed Steam API, and verifies that the UI boots, renders
 * content and reacts to user interaction without uncaught errors.
 *
 * Run with: npm run test:ui
 */
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const results = [];
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', (reason && (reason.stack || reason.message)) || reason);
});
process.on('uncaughtException', (error) => {
  console.error('UNCAUGHT EXCEPTION:', error && (error.stack || error.message));
});
async function check(name, fn) {
  try {
    await fn();
    results.push(true);
    console.log(`  PASS  ${name}`);
  } catch (error) {
    results.push(false);
    console.log(`  FAIL  ${name}`);
    console.log(`        ${error && error.message}`);
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function gameDetails(appid) {
  return {
    appid,
    name: `Test Game ${appid}`,
    header_image: `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/capsule_616x353.jpg`,
    screenshots: [],
    movies: [],
    description: 'Test description',
    detailed_description: '<p>Test description</p>',
    developers: ['Test Dev'],
    publishers: ['Test Pub'],
    genres: [{ id: '1', description: 'Action' }],
    categories: [],
    release_date: { coming_soon: false, date: '01 Jan, 2020' },
    price: { final: 0, currency: 'USD' },
    dlc: [],
    platforms: { windows: true },
    metacritic: null,
    tags: []
  };
}

const ipcCalls = [];
const ipcResponses = {
  'get-config': () => ({
    steamPath: 'C:\\Steam',
    theme: 'dark',
    autoStart: false,
    discordRPC: true,
    animations: true,
    soundEffects: true,
    apiCooldown: 1000,
    maxConcurrentRequests: 5,
    discordInviteAsked: true
  }),
  'get-app-version': () => '2.0.3',
  'get-library-games': () => [],
  'refresh-active-users': () => 0,
  'get-active-users-count': () => 0,
  'fetch-game-details': (appId) => gameDetails(appId)
};

const ipcRendererStub = {
  invoke: async (channel, ...args) => {
    ipcCalls.push({ channel, args });
    const responder = ipcResponses[channel];
    if (!responder) return null;
    return responder(...args);
  },
  on: () => {},
  send: () => {}
};

function jsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
    text: async () => (typeof payload === 'string' ? payload : JSON.stringify(payload))
  };
}

function createFetchStub(appids) {
  const details = {};
  for (const appid of appids) details[appid] = { success: true, data: gameDetails(appid) };
  return async (url) => {
    if (String(url).includes('get.geojs.io')) return jsonResponse({ country: 'TR' });
    if (String(url).includes('appdetails')) {
      const match = /appids=(\d+)/.exec(String(url));
      const appid = match ? Number(match[1]) : appids[0];
      if (!details[appid]) details[appid] = { success: true, data: gameDetails(appid) };
      return jsonResponse({ [appid]: details[appid] });
    }
    if (String(url).includes('search/results')) {
      const term = decodeURIComponent((/term=([^&]*)/.exec(String(url)) || [])[1] || 'Test Game 220');
      return jsonResponse(
        `<a class="search_result_row" data-ds-appid="220">` +
        `<span class="title">${term}</span>` +
        `<div class="search_price">100,00 TL</div>` +
        `</a>`
      );
    }
    if (String(url).includes('translate.googleapis.com')) return jsonResponse([[['ceviri', 'source', null, null]]]);
    return jsonResponse({});
  };
}

(async function run() {
  const rendererDir = path.join(__dirname, '..', 'src', 'renderer');
  const html = fs.readFileSync(path.join(rendererDir, 'index.html'), 'utf8');
  const rendererSource = fs.readFileSync(path.join(rendererDir, 'renderer.js'), 'utf8');

  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => errors.push(error));

  const dom = new JSDOM(html, {
    url: 'https://psl.local/src/renderer/index.html',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole
  });

  const { window } = dom;
  window.require = (moduleName) => {
    if (moduleName === 'electron') return { ipcRenderer: ipcRendererStub };
    return require(moduleName);
  };
  window.process = { argv: ['electron', '.'], platform: 'win32', versions: {}, env: {} };
  window.fetch = createFetchStub([1436990, 2300230, 2255360, 2418490, 2358720, 2749880, 1593500, 3181470, 1941540, 1174180]);
  window.open = () => null;
  window.alert = () => {};
  window.scrollTo = () => {};
  window.addEventListener('error', (event) => errors.push(event.error || new Error(event.message)));
  window.addEventListener('unhandledrejection', (event) => errors.push(event.reason));

  console.log('\nParadise Steam Library - renderer smoke test');

  const errorList = () => errors.map((e) => (e && e.message) || String(e)).join(' | ');

  await check('renderer script evaluates without uncaught errors', async () => {
    window.eval(rendererSource);
    if (window.document.readyState !== 'loading') {
      window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
    }
    await wait(2500);
    assert.deepStrictEqual(errors.map((e) => (e && e.message) || String(e)), [], `uncaught errors: ${errorList()}`);
  });

  await check('home page renders game cards from the Steam API', async () => {
    const cards = window.document.querySelectorAll('.game-card');
    assert.ok(cards.length > 0, 'no .game-card elements were rendered');
    assert.ok(window.document.body.textContent.includes('Test Game'), 'game titles are missing from the DOM');
  });

  await check('boot asks the main process for config and version', async () => {
    assert.ok(window.document.getElementById('steamPathInput'), 'steamPathInput element is missing');
    assert.ok(ipcCalls.some((c) => c.channel === 'get-config'), 'get-config IPC call was not made');
    assert.ok(ipcCalls.some((c) => c.channel === 'get-app-version'), 'get-app-version IPC call was not made');
  });

  await check('library navigation is wired to the library IPC channel', async () => {
    const libraryBubble = window.document.getElementById('bubbleLibrary');
    assert.ok(libraryBubble, 'bubbleLibrary button is missing');
    libraryBubble.dispatchEvent(new window.Event('click', { bubbles: true }));
    await wait(300);
    assert.ok(ipcCalls.some((c) => c.channel === 'get-library-games'), 'get-library-games IPC call was not made');
  });

  await check('settings page opens without throwing', async () => {
    const settingsBubble = window.document.getElementById('bubbleSettings');
    assert.ok(settingsBubble, 'bubbleSettings button is missing');
    settingsBubble.dispatchEvent(new window.Event('click', { bubbles: true }));
    await wait(500);
    assert.deepStrictEqual(errors.map((e) => (e && e.message) || String(e)), [], `uncaught errors: ${errorList()}`);
    const settingsPage = window.document.getElementById('settingsPage');
    assert.ok(settingsPage && settingsPage.classList.contains('active'), 'settings page did not become active');
    assert.ok(window.document.getElementById('steamPathInput').value === 'C:\\Steam', 'settings did not show the configured Steam path');
  });

  await check('search filters the rendered games without errors', async () => {
    const searchInput = window.document.getElementById('searchInput');
    searchInput.value = 'Test Game 220';
    searchInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    await wait(1500);
    assert.deepStrictEqual(errors.map((e) => (e && e.message) || String(e)), [], `uncaught errors: ${errorList()}`);
    const grid = window.document.getElementById('gamesGrid');
    const cards = grid.querySelectorAll('.game-card');
    assert.ok(cards.length >= 1, 'search rendered no cards');
    assert.ok(grid.textContent.includes('Test Game 220'), 'search results do not contain the searched game');
  });

  await check('safeSteamFetch is defined exactly once (regression)', async () => {
    const definitions = rendererSource.match(/async function safeSteamFetch\s*\(/g) || [];
    assert.strictEqual(definitions.length, 1, `expected 1 safeSteamFetch definition, found ${definitions.length}`);
    assert.ok(/AbortController/.test(rendererSource), 'safeSteamFetch lost its AbortController timeout guard');
  });

  const failed = results.filter((ok) => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed\n`);
  dom.window.close();
  process.exit(failed === 0 ? 0 : 1);
})().catch((error) => {
  console.error('Unexpected failure:', error);
  process.exit(1);
});

