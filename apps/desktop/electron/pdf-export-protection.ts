import { promises as fs } from 'node:fs'
import { resolve } from 'node:path'

async function canonicalPath(value: string): Promise<string> {
  return fs.realpath(value).catch(() => resolve(value))
}

export async function sameFilePath(left: string | undefined, right: string | undefined, platform = process.platform): Promise<boolean> {
  if (!left || !right) return false
  const [canonicalLeft, canonicalRight] = await Promise.all([canonicalPath(left), canonicalPath(right)])
  return platform === 'win32'
    ? canonicalLeft.toLocaleLowerCase() === canonicalRight.toLocaleLowerCase()
    : canonicalLeft === canonicalRight
}
