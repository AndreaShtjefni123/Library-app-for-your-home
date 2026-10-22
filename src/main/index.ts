import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { registerIpc } from './ipc'
import { lockDownSession, lockDownWindow } from './security'
import { frameColours, TITLE_BAR_HEIGHT } from './theme'
import { closePool } from './db/pool'
import { handleImageSchemes, registerImageSchemes } from './protocols'
import { coversDir } from './paths'

const APP_NAME = "Home Library"

// Keep all app data in %APPDATA%\HomeLibrary (no apostrophe in the folder name).
// Automated tests point this somewhere temporary so they never touch real settings.
app.setName(APP_NAME)
// Test-only switches must never affect the installed app.
if (app.isPackaged) {
  delete process.env['HOME_LIBRARY_FAKE_NET']
  delete process.env['HOME_LIBRARY_DB_FROM_ENV']
}
app.setPath('userData', process.env['HOME_LIBRARY_USER_DATA'] ?? join(app.getPath('appData'), 'HomeLibrary'))

registerImageSchemes()

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: frameColours.light.bg,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: frameColours.light.bg,
      symbolColor: frameColours.light.symbols,
      height: TITLE_BAR_HEIGHT
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })

  lockDownWindow(mainWindow)
  mainWindow.once('ready-to-show', () => mainWindow?.show())

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// Only one copy of the app may run: a second launch focuses the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    lockDownSession()
    handleImageSchemes(coversDir)
    registerIpc()
    createWindow()
  })

  app.on('window-all-closed', () => app.quit())
  app.on('will-quit', () => {
    closePool().catch(() => {})
  })
}
