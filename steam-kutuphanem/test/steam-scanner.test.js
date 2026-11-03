'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const scanner = require('../src/main/steam-scanner');

function manifest(appid, name, { size = 1024, lastPlayed = 0, lastUpdated = 0, stateFlags = 4 } = {}) {
  return `"AppState"
{
	"appid"		"${appid}"
	"name"		"${name}"
	"StateFlags"		"${stateFlags}"
	"installdir"		"${name} Klasoru"
	"SizeOnDisk"		"${size}"
	"LastPlayed"		"${lastPlayed}"
	"LastUpdated"		"${lastUpdated}"
}
`;
}

async function createFakeSteam(rootPath, secondLibraryPath) {
  await fs.mkdir(path.join(rootPath, 'steamapps'), { recursive: true });
  await fs.mkdir(path.join(secondLibraryPath, 'steamapps'), { recursive: true });

  const libraryFolders = `"libraryfolders"
{
	"0"
	{
		"path"		"${rootPath.replace(/\\/g, '\\\\')}"
		"apps"
		{
			"730"		"1024"
		}
	}
	"1"
	{
		"path"		"${secondLibraryPath.replace(/\\/g, '\\\\')}"
	}
	"2"
	{
		"path"		"${path.join(rootPath, 'silinmis-kutuphane').replace(/\\/g, '\\\\')}"
	}
}
`;

  await fs.writeFile(path.join(rootPath, 'steamapps', 'libraryfolders.vdf'), libraryFolders);
  await fs.writeFile(path.join(rootPath, 'steamapps', 'appmanifest_730.acf'), manifest(730, 'Counter-Strike 2', { size: 2048 }));
  await fs.writeFile(path.join(rootPath, 'steamapps', 'appmanifest_400.acf'), manifest(400, 'Portal', { lastPlayed: 1700000000 }));
  await fs.writeFile(path.join(rootPath, 'steamapps', 'appmanifest_bozuk.acf'), '"AppState" { "appid" }');
  await fs.writeFile(path.join(secondLibraryPath, 'steamapps', 'appmanifest_570.acf'), manifest(570, 'Dota 2', { size: 4096 }));
  await fs.writeFile(
    path.join(secondLibraryPath, 'steamapps', 'appmanifest_730.acf'),
    manifest(730, 'Counter-Strike 2', { size: 8192, lastUpdated: 999 })
  );
}

test('sahte Steam kurulumunu bulur ve kutuphaneleri tarar', async (t) => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sk-scan-'));
  t.after(() => fs.rm(tmp, { recursive: true, force: true }));

  const rootPath = path.join(tmp, 'Steam');
  const secondLibrary = path.join(tmp, 'SteamLibrary');
  await createFakeSteam(rootPath, secondLibrary);

  const found = await scanner.findSteamRoot([path.join(tmp, 'yok'), rootPath]);
  assert.equal(found, rootPath);

  const result = await scanner.scanSteamLibrary(rootPath);
  assert.equal(result.steamRoot, rootPath);
  assert.equal(result.games.length, 3, 'bozuk acf dosyasi taramayi bozmamali');
  assert.deepEqual(result.games.map((game) => game.name), ['Counter-Strike 2', 'Dota 2', 'Portal']);

  const byId = new Map(result.games.map((game) => [game.appid, game]));
  assert.equal(byId.size, 3, 'ayni appid birden fazla kutuphanede olsa da tek kayit olmali');

  // 730 iki kutuphanede: daha yeni LastUpdated olan (ikinci kutuphane) kazanmali
  assert.equal(byId.get(730).sizeOnDisk, 8192);
  assert.equal(byId.get(730).libraryPath, secondLibrary);

  assert.equal(byId.get(400).installed, true);
  assert.equal(byId.get(400).lastPlayed, 1700000000);
  assert.equal(byId.get(570).name, 'Dota 2');

  // Silinmis kutuphane taramayi bozmamali
  assert.ok(result.libraries.includes(rootPath));
  assert.ok(result.libraries.includes(secondLibrary));
});

test('StateFlags 4 degilse oyun kurulu sayilmaz', () => {
  const parsed = scanner.parseAppManifest(manifest(10, 'Test Oyun', { stateFlags: 2 }));
  assert.equal(parsed.installed, false);
  assert.equal(parsed.appid, 10);
  assert.equal(parsed.name, 'Test Oyun');
});

test('Steam kokune ulasilamazsa bos sonuc doner', async () => {
  const result = await scanner.scanSteamLibrary(null);
  assert.deepEqual(result.games, []);
  assert.equal(result.steamRoot, null);
  assert.deepEqual(await scanner.scanLibraryFolder('/boyle/bir/yer/yok'), []);
});

test('platforma gore aday Steam yollari uretilir', () => {
  const windows = scanner.candidateSteamRoots({ platform: 'win32', homedir: '/home/test', env: { 'ProgramFiles(x86)': 'C:\\PF86', ProgramFiles: 'C:\\PF' } });
  assert.ok(windows.includes(path.join('C:\\PF86', 'Steam')));
  assert.ok(windows.includes(path.join('C:\\PF', 'Steam')));

  const linux = scanner.candidateSteamRoots({ platform: 'linux', homedir: '/home/test', env: {} });
  assert.ok(linux.some((candidate) => candidate.includes('.steam') || candidate.includes('.local')));
});

test('eski libraryfolders.vdf formatini da okur', () => {
  const libraries = scanner.parseLibraryFolders(
    '"LibraryFolders" { "TimeNextStatsReport" "123" "1" "/mnt/oyunlar/SteamLibrary" }',
    '/opt/steam'
  );
  assert.deepEqual(libraries, ['/mnt/oyunlar/SteamLibrary']);
});
