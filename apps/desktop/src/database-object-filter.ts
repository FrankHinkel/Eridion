import type { SchemaRelationship, SchemaSnapshot } from './model'

export interface SchemaTableIdentity {
  schema?: string
  name: string
}

export type SchemaTablePlacement = 'current' | 'other' | 'unused'

export function schemaTableIdentityKey(table: SchemaTableIdentity): string {
  return `${table.schema ?? ''}.${table.name}`
}

function sourceKey(relationship: SchemaRelationship): string {
  return schemaTableIdentityKey({ schema: relationship.sourceSchema, name: relationship.sourceTable })
}

function targetKey(relationship: SchemaRelationship): string {
  return schemaTableIdentityKey({ schema: relationship.targetSchema, name: relationship.targetTable })
}

export function relatedSchemaTableKeys(snapshot: SchemaSnapshot, selected?: SchemaTableIdentity): Set<string> | undefined {
  if (!selected) return undefined
  const selectedKey = schemaTableIdentityKey(selected)
  const related = new Set<string>()
  for (const relationship of snapshot.relationships) {
    const source = sourceKey(relationship)
    const target = targetKey(relationship)
    if (source === selectedKey && target !== selectedKey) related.add(target)
    if (target === selectedKey && source !== selectedKey) related.add(source)
  }
  return related
}

export function schemaTablePlacement(
  table: SchemaTableIdentity,
  currentPageTables: SchemaTableIdentity[],
  otherPageTables: SchemaTableIdentity[]
): SchemaTablePlacement {
  const key = schemaTableIdentityKey(table)
  if (currentPageTables.some((candidate) => schemaTableIdentityKey(candidate) === key)) return 'current'
  if (otherPageTables.some((candidate) => schemaTableIdentityKey(candidate) === key)) return 'other'
  return 'unused'
}
