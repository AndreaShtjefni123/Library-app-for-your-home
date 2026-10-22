import { app, session, shell, type BrowserWindow } from 'electron'

const isDev = !app.isPackaged && !!process.env['ELECTRON_RENDERER_URL']

/** Schemes the app window itself may load. Online catalogue requests run in the main process instead. */
function rendererMayLoad(url: string): boolean {
  if (/^(file|devtools|data|blob|chrome-extension|cover|remote-img):/.test(url)) return true
  if (isDev) {
    const dev = new URL(process.env['ELECTRON_RENDERER_URL']!)
    const u = new URL(url)
    return u.hostname === dev.hostname && u.port === dev.port
  }
  return false
}

export function lockDownSession(): void {
  const ses = session.defaultSession

  ses.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !rendererMayLoad(details.url) })
  })

  // Production gets a strict policy as a header too (dev needs Vite's hot reload).
  if (!isDev) {
    ses.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: cover: remote-img:; font-src 'self' data:; connect-src 'self'"
          ]
        }
      })
    })
  }

  // The app never asks for camera, microphone, location, notifications…
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
}

export function lockDownWindow(win: BrowserWindow): void {
  // Never navigate the app window away; real web links open in the default browser.
  win.webContents.on('will-navigate', (event, url) => {
    if (!rendererMayLoad(url)) event.preventDefault()
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
}
