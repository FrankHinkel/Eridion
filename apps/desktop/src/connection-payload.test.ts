import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import { createConnectionPayload } from './connection-payload'

describe('connection IPC payload', () => {
  it('converts a Vue reactive connection into a structured-cloneable object', () => {
    const form = reactive({
      id: 'connection-1',
      name: 'Local SQLite',
      driverId: 'sqlite',
      url: 'jdbc:sqlite::memory:',
      user: '',
      password: '',
      properties: reactive({ busy_timeout: '5000' })
    })

    const payload = createConnectionPayload(form, '{"busy_timeout":5000}')

    expect(() => structuredClone(payload)).not.toThrow()
    expect(payload.properties).toEqual({ busy_timeout: '5000' })
  })

  it('rejects non-object connection properties', () => {
    const connection = {
      id: 'connection-1', name: 'Test', driverId: 'sqlite',
      url: 'jdbc:sqlite::memory:', user: '', properties: {}
    }

    expect(() => createConnectionPayload(connection, '[1,2]')).toThrow('JSON-Objekt')
  })
})

