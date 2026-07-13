import { describe, expect, it } from 'vitest'
import { relatedSchemaTableKeys, schemaTablePlacement } from './database-object-filter'
import type { SchemaSnapshot } from './model'

const snapshot: SchemaSnapshot = {
  databaseProduct: 'PostgreSQL', databaseVersion: '17', importedAt: 'now',
  tables: [],
  relationships: [
    { sourceSchema: 'public', sourceTable: 'ORDERS', sourceColumn: 'CUSTOMER_ID', targetSchema: 'public', targetTable: 'CUSTOMERS', targetColumn: 'ID' },
    { sourceSchema: 'public', sourceTable: 'ORDER_ITEMS', sourceColumn: 'ORDER_ID', targetSchema: 'public', targetTable: 'ORDERS', targetColumn: 'ID' },
    { sourceSchema: 'public', sourceTable: 'ORDERS', sourceColumn: 'PARENT_ID', targetSchema: 'public', targetTable: 'ORDERS', targetColumn: 'ID' },
    { sourceSchema: 'audit', sourceTable: 'EVENTS', sourceColumn: 'ID', targetSchema: 'audit', targetTable: 'USERS', targetColumn: 'ID' }
  ]
}

describe('database object relationship filter', () => {
  it('returns both incoming and outgoing neighboring tables without the selected table', () => {
    expect([...relatedSchemaTableKeys(snapshot, { schema: 'public', name: 'ORDERS' })!].sort()).toEqual([
      'public.CUSTOMERS', 'public.ORDER_ITEMS'
    ])
  })

  it('does not activate without a selected table', () => {
    expect(relatedSchemaTableKeys(snapshot)).toBeUndefined()
  })

  it('prioritizes placement on the current page over placement on other pages', () => {
    const table = { schema: 'public', name: 'ORDERS' }
    expect(schemaTablePlacement(table, [table], [table])).toBe('current')
    expect(schemaTablePlacement(table, [], [table])).toBe('other')
    expect(schemaTablePlacement(table, [], [])).toBe('unused')
  })
})
