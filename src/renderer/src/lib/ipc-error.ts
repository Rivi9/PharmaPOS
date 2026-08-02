/**
 * Turn a rejected `ipcRenderer.invoke` into something a cashier can read.
 *
 * Electron prefixes every error thrown inside an `ipcMain.handle` callback with
 * `Error invoking remote method 'channel:name':`, so a validation message the
 * main process wrote carefully arrives buried in plumbing. Handlers signal
 * failure by throwing (there is no `{ success: false }` envelope), which means
 * every call site that skips this ends up with a silent unhandled rejection.
 */
export function ipcErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (!error) return fallback
  const raw = error instanceof Error ? error.message : String(error)
  const unwrapped = raw.replace(/^Error invoking remote method '[^']*':\s*/, '')
  // Nested rethrows can leave several `Error:` prefixes stacked up.
  const clean = unwrapped.replace(/^(?:Error:\s*)+/, '').trim()
  return clean || fallback
}
