import type { StoredConnection } from '../electron/types'

export function createConnectionPayload(
  connection: StoredConnection,
  propertiesText: string
): StoredConnection {
  const properties = JSON.parse(propertiesText || '{}') as Record<string, string>
  if (!properties || Array.isArray(properties) || typeof properties !== 'object') {
    throw new Error('Connection Properties müssen ein JSON-Objekt sein.')
  }
  return {
    id: String(connection.id),
    name: String(connection.name),
    driverId: String(connection.driverId),
    url: String(connection.url),
    user: String(connection.user ?? ''),
    password: String(connection.password ?? ''),
    hasPassword: Boolean(connection.hasPassword),
    driverClass: connection.driverClass ? String(connection.driverClass) : undefined,
    driverJar: connection.driverJar ? String(connection.driverJar) : undefined,
    properties: Object.fromEntries(
      Object.entries(properties).map(([key, value]) => [String(key), String(value)])
    ),
    schemaSql: connection.schemaSql ? String(connection.schemaSql) : undefined,
    objectSql: connection.objectSql ? String(connection.objectSql) : undefined
  }
}

