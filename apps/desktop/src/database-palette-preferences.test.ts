import { describe, expect, it } from 'vitest'
import { preferredDatabaseSchema, preferredDatabaseSource } from './database-palette-preferences'

describe('database palette preferences', () => {
  it('restores the stored source when the component is mounted again', () => {
    expect(preferredDatabaseSource(['postgres', 'snapshot:one'], '', 'snapshot:one')).toBe('snapshot:one')
    expect(preferredDatabaseSource(['postgres'], '', 'deleted')).toBe('postgres')
  })

  it('restores a schema per source and preserves the all-schemas choice', () => {
    expect(preferredDatabaseSchema(['public', 'audit'], 'audit', 'public')).toBe('audit')
    expect(preferredDatabaseSchema(['public', 'audit'], '', 'public')).toBe('')
    expect(preferredDatabaseSchema(['public'], 'removed', 'public')).toBe('public')
  })
})
