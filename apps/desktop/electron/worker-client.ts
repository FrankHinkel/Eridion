import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import { randomUUID } from 'node:crypto'

interface PendingCall {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

export class WorkerClient {
  private child?: ChildProcessWithoutNullStreams
  private readonly pending = new Map<string, PendingCall>()

  constructor(private readonly jarPath: string, private readonly javaExecutable = 'java') {}

  start(): void {
    if (this.child) return
    this.child = spawn(this.javaExecutable, ['-jar', this.jarPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })
    createInterface({ input: this.child.stdout }).on('line', (line) => this.handleLine(line))
    this.child.stderr.on('data', (data) => console.error(`[worker] ${String(data).trimEnd()}`))
    this.child.on('exit', (code, signal) => {
      const error = new Error(`Der Eridion-Worker wurde beendet (${code ?? signal ?? 'unbekannt'}).`)
      for (const call of this.pending.values()) {
        clearTimeout(call.timer)
        call.reject(error)
      }
      this.pending.clear()
      this.child = undefined
    })
    this.child.on('error', (error) => {
      console.error('Kotlin-Worker konnte nicht gestartet werden.', error)
      for (const call of this.pending.values()) {
        clearTimeout(call.timer)
        call.reject(error)
      }
      this.pending.clear()
    })
  }

  async call<T>(method: string, params: Record<string, unknown> = {}, timeoutMs = 60_000): Promise<T> {
    this.start()
    if (!this.child || !this.child.stdin.writable) {
      throw new Error('Der Kotlin-Worker ist nicht verfügbar. Bitte zuerst den Worker bauen.')
    }
    const id = randomUUID()
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Zeitüberschreitung bei ${method}.`))
      }, timeoutMs)
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer })
      this.child!.stdin.write(`${JSON.stringify({ id, method, params })}\n`)
    })
  }

  stop(): void {
    this.child?.kill()
    this.child = undefined
  }

  private handleLine(line: string): void {
    let response: { id: string; result?: unknown; error?: { message: string; details?: string } }
    try {
      response = JSON.parse(line)
    } catch {
      console.error('Ungültige Worker-Antwort:', line)
      return
    }
    const call = this.pending.get(response.id)
    if (!call) return
    clearTimeout(call.timer)
    this.pending.delete(response.id)
    if (response.error) {
      const error = new Error(response.error.message)
      if (response.error.details) error.stack = response.error.details
      call.reject(error)
    } else {
      call.resolve(response.result)
    }
  }
}
