/**
 * Renderer-side Web Serial implementation for the VFD pole display.
 *
 * The main process (pole-display.ts) has no access to serial hardware directly —
 * it sends command objects over the 'serial:cmd' IPC channel to this module,
 * which uses navigator.serial (Chromium's Web Serial API) to do the actual I/O.
 *
 * Flow:
 *   Main → send('serial:cmd', cmd)  → this module
 *   This module → ipcRenderer.send('serial:result', result) → main
 *   This module → ipcRenderer.send('serial:ready')          → main (on init)
 */

const SERIAL_CMD_CHANNEL = 'serial:cmd'
const SERIAL_RESULT_CHANNEL = 'serial:result'
const SERIAL_READY_CHANNEL = 'serial:ready'

type SerialCmd =
  | { type: 'listPorts' }
  | { type: 'connect'; portName: string; baudRate: number }
  | { type: 'disconnect' }
  | { type: 'write'; data: string }

let activePort: SerialPort | null = null

/** Attempt to request a port via the browser API.
 *  Returns null if the user cancelled or if no ports were available. */
async function requestPort(): Promise<SerialPort | null> {
  try {
    return await navigator.serial.requestPort()
  } catch {
    return null
  }
}

/** Write raw bytes to the open port. Silently ignores write errors. */
async function writeToPort(data: string): Promise<void> {
  if (!activePort?.writable) return
  const writer = activePort.writable.getWriter()
  try {
    // Convert string to raw bytes using latin1 encoding (char code → byte value).
    // This preserves VFD control codes (\x0C clear, \x0D\x0A CRLF) correctly.
    const bytes = new Uint8Array([...data].map((c) => c.charCodeAt(0) & 0xff))
    await writer.write(bytes)
  } catch {
    // Silent — display may be unplugged
  } finally {
    writer.releaseLock()
  }
}

// ── Command handler ───────────────────────────────────────────────────────────

window.electron.ipcRenderer.on(SERIAL_CMD_CHANNEL, async (_event: unknown, cmd: SerialCmd) => {
  switch (cmd.type) {
    case 'listPorts': {
      // Trigger requestPort() so the main process can capture the port list
      // via the 'select-serial-port' session event, then cancel (callback('')).
      // requestPort() will throw NotFoundError — that is expected and ignored.
      await requestPort()
      break
    }

    case 'connect': {
      // Trigger requestPort() — main will auto-select the matching port
      // via the 'select-serial-port' session event using portName.
      const port = await requestPort()
      if (!port) {
        window.electron.ipcRenderer.send(SERIAL_RESULT_CHANNEL, {
          type: 'connect',
          success: false,
          error: 'Port not found or not available'
        })
        return
      }
      try {
        await port.open({ baudRate: cmd.baudRate })
        activePort = port
        // Clear display on connect
        await writeToPort('\x0C0.00')
        window.electron.ipcRenderer.send(SERIAL_RESULT_CHANNEL, { type: 'connect', success: true })
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        window.electron.ipcRenderer.send(SERIAL_RESULT_CHANNEL, {
          type: 'connect',
          success: false,
          error: message
        })
      }
      break
    }

    case 'disconnect': {
      if (activePort) {
        try {
          await activePort.close()
        } catch {
          // Ignore close errors — port may already be gone
        }
        activePort = null
      }
      window.electron.ipcRenderer.send(SERIAL_RESULT_CHANNEL, {
        type: 'disconnect',
        success: true
      })
      break
    }

    case 'write': {
      await writeToPort(cmd.data)
      break
    }
  }
})

// Signal main that this module is loaded and ready to receive commands.
// Main uses this to trigger auto-connect after reading saved settings.
window.electron.ipcRenderer.send(SERIAL_READY_CHANNEL)
