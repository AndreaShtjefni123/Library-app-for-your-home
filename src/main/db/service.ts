import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

/**
 * Starts the PostgreSQL Windows service. Starting a service needs admin rights,
 * so Windows shows its usual "Do you want to allow this app…" prompt.
 */
export async function startPostgresService(): Promise<{ ok: boolean; message?: string }> {
  const script = [
    "$svc = Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue | Select-Object -First 1",
    "if (-not $svc) { Write-Output 'NOT_FOUND'; exit 0 }",
    "if ($svc.Status -eq 'Running') { Write-Output 'Running'; exit 0 }",
    "Start-Process -FilePath sc.exe -ArgumentList @('start', $svc.Name) -Verb RunAs -WindowStyle Hidden -Wait",
    'Start-Sleep -Seconds 2',
    '(Get-Service -Name $svc.Name).Status'
  ].join('; ')
  try {
    const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      timeout: 60_000
    })
    const out = stdout.trim()
    if (out === 'NOT_FOUND') return { ok: false, message: 'No PostgreSQL service was found on this PC.' }
    if (out.endsWith('Running')) return { ok: true }
    return { ok: false, message: 'The database is still starting. Wait a moment and press Retry.' }
  } catch {
    return { ok: false, message: 'Windows did not allow the database to start (the prompt may have been cancelled).' }
  }
}
