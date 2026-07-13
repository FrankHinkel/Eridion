import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'
import type { StoredConnection } from './types'

interface PersistedConnection extends Omit<StoredConnection, 'password' | 'hasPassword'> {
  passwordEncrypted?: string
}

export interface PasswordCipher {
  encrypt(value: string): string
  decrypt(value: string): string
}

export class ConnectionStore {
  constructor(private readonly filePath: string, private readonly cipher: PasswordCipher) {}

  async list(): Promise<StoredConnection[]> {
    const values = await this.read()
    return values.map(({ passwordEncrypted, ...connection }) => ({
      ...connection,
      hasPassword: Boolean(passwordEncrypted),
      password: ''
    }))
  }

  async save(input: StoredConnection): Promise<StoredConnection[]> {
    const values = await this.read()
    const existing = values.find((value) => value.id === input.id)
    const encrypted = input.password
      ? this.encrypt(input.password)
      : existing?.passwordEncrypted
    const persisted: PersistedConnection = {
      id: input.id,
      name: input.name,
      driverId: input.driverId,
      url: input.url,
      user: input.user,
      driverClass: input.driverClass,
      driverJar: input.driverJar,
      properties: input.properties ?? {},
      schemaSql: input.schemaSql,
      objectSql: input.objectSql,
      passwordEncrypted: encrypted
    }
    const next = [...values.filter((value) => value.id !== input.id), persisted]
      .sort((a, b) => a.name.localeCompare(b.name))
    await this.write(next)
    return this.list()
  }

  async delete(id: string): Promise<StoredConnection[]> {
    await this.write((await this.read()).filter((value) => value.id !== id))
    return this.list()
  }

  async resolved(id: string): Promise<StoredConnection> {
    const value = (await this.read()).find((item) => item.id === id)
    if (!value) throw new Error('Die Connection wurde nicht gefunden.')
    const { passwordEncrypted, ...connection } = value
    return {
      ...connection,
      password: passwordEncrypted ? this.decrypt(passwordEncrypted) : ''
    }
  }

  private async read(): Promise<PersistedConnection[]> {
    try {
      return JSON.parse(await fs.readFile(this.filePath, 'utf8')) as PersistedConnection[]
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  }

  private async write(values: PersistedConnection[]): Promise<void> {
    await fs.mkdir(dirname(this.filePath), { recursive: true })
    const temporary = `${this.filePath}.tmp`
    const backup = `${this.filePath}.backup`
    await fs.writeFile(temporary, JSON.stringify(values, null, 2), { mode: 0o600 })
    let hadExisting = false
    try {
      await fs.rename(this.filePath, backup)
      hadExisting = true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    try {
      await fs.rename(temporary, this.filePath)
      if (hadExisting) await fs.rm(backup, { force: true })
    } catch (error) {
      if (hadExisting) await fs.rename(backup, this.filePath).catch(() => undefined)
      throw error
    }
  }

  private encrypt(value: string): string {
    return this.cipher.encrypt(value)
  }

  private decrypt(value: string): string {
    return this.cipher.decrypt(value)
  }
}
