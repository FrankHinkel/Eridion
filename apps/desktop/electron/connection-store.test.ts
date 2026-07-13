import { afterEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ConnectionStore } from './connection-store'
import type { StoredConnection } from './types'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })))
})

function connection(id: string, name: string): StoredConnection {
  return {
    id, name, driverId: 'postgresql', url: 'jdbc:postgresql://localhost/test',
    user: 'test', password: 'secret', properties: {}
  }
}

describe('ConnectionStore CRUD', () => {
  it('creates, overwrites and deletes a persisted connection by id', async () => {
    const directory = await fs.mkdtemp(join(tmpdir(), 'eridion-connections-'))
    directories.push(directory)
    const store = new ConnectionStore(join(directory, 'connections.json'), {
      encrypt: (value) => Buffer.from(value).toString('base64'),
      decrypt: (value) => Buffer.from(value, 'base64').toString()
    })

    expect(await store.save(connection('connection-1', 'Neue Connection'))).toMatchObject([
      { id: 'connection-1', name: 'Neue Connection', hasPassword: true }
    ])

    const edited = connection('connection-1', 'Produktivdatenbank')
    edited.password = ''
    const afterEdit = await store.save(edited)
    expect(afterEdit).toHaveLength(1)
    expect(afterEdit[0]).toMatchObject({ id: 'connection-1', name: 'Produktivdatenbank', hasPassword: true })
    expect((await store.resolved('connection-1')).password).toBe('secret')

    expect(await store.delete('connection-1')).toEqual([])
    await expect(store.resolved('connection-1')).rejects.toThrow('nicht gefunden')
  })
})
