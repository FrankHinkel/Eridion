export function preferredDatabaseSource(availableIds: string[], currentId: string, storedId?: string): string {
  if (currentId && availableIds.includes(currentId)) return currentId
  if (storedId && availableIds.includes(storedId)) return storedId
  return availableIds[0] ?? ''
}

export function preferredDatabaseSchema(availableSchemas: string[], storedSchema: string | undefined, fallback = ''): string {
  if (storedSchema === '') return ''
  if (storedSchema && availableSchemas.includes(storedSchema)) return storedSchema
  return fallback && availableSchemas.includes(fallback) ? fallback : ''
}
