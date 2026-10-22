import { app } from 'electron'
import { join } from 'node:path'

/** Where saved covers and author photos live: %APPDATA%\HomeLibrary\covers */
export const coversDir = (): string => join(app.getPath('userData'), 'covers')
