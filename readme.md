# Paradise Steam Library

Modern Steam Library Manager - Manage your Steam games with advanced features and a user-friendly interface.

## 🚀 Features

### 📚 Steam Library Management
- **Add Games**: Add games to your Steam library
- **DLC Support**: Add DLCs along with games
- **Library Viewing**: View your current games
- **Game Removal**: Remove games from your library

### 🌐 Online Game System
- **Online Pass**: Download and install online games
- **Steam API Integration**: Real game names and images
- **Automatic Image**: Automatically retrieve images from Steam CDN
- **Smart Fallback**: Backup system in case of API error

### 🎮 Manual Game Installation
- **ZIP File Support**: Install manual ZIP files
- **Automatic Detection**: Automatically detects the game ID
- **Steam Integration**: Automatically adds to the Steam library

### 🤖 Built-in AI Chat
- AI chat assistant in the lower right corner of the app.
- Instead of Discord and external sites, you can get support from within the app.

### 🎨 Modern Interface
- **Dark Theme**: Eye-friendly dark theme
- **Responsive Design**: Compatible with all screen sizes
- **Animations**: Smooth user experience

### 🔧 Advanced Features
- **Discord RPC**: Show your game status on Discord
- **Steam Restart**: Automatically restart Steam
- **Search System**: Quick search in games
- **Categories**: Filter games by category

## 📦 Installation

### Requirements
- Node.js 16+ 
- npm or yarn
- Windows 10/11

### Development Environment
```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run in normal mode
npm start
```

### Portable Build
```bash
# Create portable exe
npm run build-portable

# All Windows builds
npm run build-win

# Only installer
npm run build
```

## 🧪 Tests

The project ships with two headless smoke test suites. They do not need a display or a real Steam installation.

```bash
# Run everything
npm test

# Main process (IPC handlers, config, library, ZIP installation)
npm run test:main

# Renderer / UI (index.html + renderer.js inside jsdom)
npm run test:ui
```

The main process suite replaces Electron with an in-memory stub and drives the real IPC
handlers the renderer uses, so a missing handler or a crash during startup fails the build.
The UI suite boots the real interface in jsdom with a stubbed Steam API and checks that the
home page, settings, library navigation and search keep working.

## [v2.0.4] - 11/03/2026

# Paradise Steam Library v2.0.4

## Bug Fixes
- The application could crash when the main window was reopened (macOS dock icon / `activate`): IPC handlers were registered a second time. A single manager instance is now reused and handlers are registered only once.
- The window could open before `config.json` and the game caches were loaded, so the settings screen occasionally showed an empty Steam path. Window creation now waits for initialization.
- The renderer defined `safeSteamFetch` twice; the second definition silently replaced the version with the `AbortController` timeout, so Steam requests could hang forever and every call was delayed by 200 ms. The duplicate was removed and the timeout-guarded version now also retries without custom headers.
- Player activity requests were sent even when no API endpoint is configured, which produced guaranteed network errors in the console.

## Tests
- Added `npm test` with a main process smoke suite (Electron stubbed) and a jsdom UI smoke suite.

---

## [v2.0.3] - 08/13/2025

# Paradise Steam Library v2.0.3

## Performance Enhancement
- The OnlinePass page was slow to load, now optimized.

## AI Enhancement
- In-app AI now behaves in a more varied and friendly manner.

## Bug Fixes
- There was an issue with game downloads, which has been fixed.
- AI was not functioning, which has been fixed.
- The search system on the OnlinePass page was not working, which has been fixed.

**The application is now more optimized and runs smoothly.**

---

## 🤝 Contribute

```
1. Fork the project
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit (`git commit -m ‘Add amazing feature’`)
4. Push (`git push origin feature/amazing-feature`)
5. Open a Pull Request
```

## 📄 License

This project is licensed. For details, see the `LICENSE` file.

## 👨‍💻 Developer

**Muhammet DAĞ** - Developed for modern Steam library management.

---

⭐ If you like this project, don't forget to star it! 

Translated with DeepL.com (free version)
