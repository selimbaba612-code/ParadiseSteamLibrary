'use strict';

/**
 * Steam kurulumunu bulur ve kurulu oyunlari okur.
 *
 * Okunan kaynaklar:
 *  - <steam>/steamapps/libraryfolders.vdf  (tum kutuphane klasorleri)
 *  - <kutuphane>/steamapps/appmanifest_<appid>.acf (oyun bilgileri)
 *
 * Hicbir dosya degistirilmez; sadece okunur.
 */

const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { parse } = require('./vdf');

// Steam'de "tam kurulu" bayragi
const STATE_FULLY_INSTALLED = 4;

function expandWindowsEnv(value, env) {
  return String(value).replace(/%([^%]+)%/g, (match, name) => {
    const key = Object.keys(env).find((item) => item.toLowerCase() === name.toLowerCase());
    return key ? env[key] : match;
  });
}

function candidateSteamRoots({ platform = process.platform, homedir = os.homedir(), env = process.env } = {}) {
  const roots = [];

  if (platform === 'win32') {
    const programFilesX86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const programFiles = env.ProgramFiles || 'C:\\Program Files';
    roots.push(
      path.join(programFilesX86, 'Steam'),
      path.join(programFiles, 'Steam'),
      'C:\\Steam'
    );
    for (const drive of ['D:', 'E:', 'F:']) roots.push(`${drive}\\Steam`, `${drive}\\SteamLibrary`);
  } else if (platform === 'darwin') {
    roots.push(path.join(homedir, 'Library', 'Application Support', 'Steam'));
  } else {
    roots.push(
      path.join(homedir, '.steam', 'steam'),
      path.join(homedir, '.local', 'share', 'Steam'),
      path.join(homedir, '.steam', 'root')
    );
  }

  return roots;
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function isSteamRoot(dir) {
  return pathExists(path.join(dir, 'steamapps'));
}

/** Verilen adaylar arasindan icinde steamapps klasoru olan ilk Steam kokunu dondurur. */
async function findSteamRoot(candidates = candidateSteamRoots()) {
  for (const candidate of candidates) {
    if (candidate && (await isSteamRoot(candidate))) return candidate;
  }
  return null;
}

function normalizeLibraryPath(rawPath, steamRoot, env = process.env) {
  if (!rawPath) return null;
  let value = String(rawPath).trim();
  if (!value) return null;
  value = expandWindowsEnv(value, env);

  if (/^[A-Za-z]:[\\/]/.test(value)) return path.win32.normalize(value);
  if (path.isAbsolute(value)) return path.normalize(value);
  return path.resolve(steamRoot, value);
}

function looksLikePath(value) {
  return /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('/') || value.startsWith('\\\\');
}

/**
 * libraryfolders.vdf icinden kutuphane yollarini cikarir.
 * Hem yeni ({"0": {"path": ...}}) hem eski ({"1": "D:\\SteamLibrary"}) formati destekler.
 */
function parseLibraryFolders(content, steamRoot, env = process.env) {
  const parsed = parse(content);
  const root = parsed.libraryfolders || parsed.LibraryFolders || parsed;
  const libraries = [];

  for (const [key, value] of Object.entries(root)) {
    if (typeof value === 'string') {
      // Eski formatta "TimeNextStatsReport" gibi sayisal olmayan anahtarlar da bulunur
      if (!/^\d+$/.test(key) && !looksLikePath(value)) continue;
      const resolved = normalizeLibraryPath(value, steamRoot, env);
      if (resolved) libraries.push(resolved);
      continue;
    }
    if (value && typeof value === 'object' && typeof value.path === 'string') {
      const resolved = normalizeLibraryPath(value.path, steamRoot, env);
      if (resolved) libraries.push(resolved);
    }
  }

  return libraries;
}

function toNumber(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** appmanifest_<appid>.acf icerigini oyun nesnesine cevirir. */
function parseAppManifest(content, libraryPath = '') {
  const parsed = parse(content);
  const state = parsed.AppState || parsed.appstate;
  if (!state) throw new Error('ACF: AppState bulunamadi');

  const appid = toNumber(state.appid, 0);
  const stateFlags = toNumber(state.StateFlags, 0);

  return {
    appid,
    name: state.name || `Oyun ${appid}`,
    installdir: state.installdir || '',
    libraryPath,
    sizeOnDisk: toNumber(state.SizeOnDisk, 0),
    lastPlayed: toNumber(state.LastPlayed, 0),
    lastUpdated: toNumber(state.LastUpdated, 0),
    stateFlags,
    installed: (stateFlags & STATE_FULLY_INSTALLED) === STATE_FULLY_INSTALLED
  };
}

async function readLibraryFolders(steamRoot, { env = process.env } = {}) {
  const file = path.join(steamRoot, 'steamapps', 'libraryfolders.vdf');
  if (!(await pathExists(file))) return [steamRoot];

  try {
    const content = await fs.readFile(file, 'utf8');
    const libraries = parseLibraryFolders(content, steamRoot, env);
    const unique = [];
    for (const library of [steamRoot, ...libraries]) {
      const normalized = path.normalize(library);
      if (!unique.includes(normalized)) unique.push(normalized);
    }
    return unique;
  } catch {
    // Bozuk vdf: en azindan ana kutuphaneyi kullan
    return [steamRoot];
  }
}

async function scanLibraryFolder(libraryPath) {
  const steamapps = path.join(libraryPath, 'steamapps');

  let entries;
  try {
    entries = await fs.readdir(steamapps);
  } catch {
    return [];
  }

  const manifests = entries.filter((entry) => /^appmanifest_\d+\.acf$/i.test(entry));
  const games = [];

  for (const manifest of manifests) {
    try {
      const content = await fs.readFile(path.join(steamapps, manifest), 'utf8');
      const game = parseAppManifest(content, libraryPath);
      if (game.appid > 0) games.push(game);
    } catch {
      // Tek bir bozuk dosya tum taramayi bozmasin
    }
  }

  return games;
}

/** Tum kutuphaneleri tarar; ayni appid birden fazla yerde varsa en guncel kaydi tutar. */
async function scanSteamLibrary(steamRoot) {
  if (!steamRoot) return { steamRoot: null, libraries: [], games: [] };

  const libraries = await readLibraryFolders(steamRoot);
  const byAppId = new Map();

  for (const library of libraries) {
    const games = await scanLibraryFolder(library);
    for (const game of games) {
      const existing = byAppId.get(game.appid);
      if (!existing) {
        byAppId.set(game.appid, game);
        continue;
      }
      const existingScore = existing.lastUpdated + (existing.installed ? 1e12 : 0);
      const newScore = game.lastUpdated + (game.installed ? 1e12 : 0);
      if (newScore > existingScore) byAppId.set(game.appid, game);
    }
  }

  const games = [...byAppId.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  return { steamRoot, libraries, games };
}

module.exports = {
  STATE_FULLY_INSTALLED,
  candidateSteamRoots,
  findSteamRoot,
  normalizeLibraryPath,
  parseLibraryFolders,
  parseAppManifest,
  readLibraryFolders,
  scanLibraryFolder,
  scanSteamLibrary,
  pathExists
};
