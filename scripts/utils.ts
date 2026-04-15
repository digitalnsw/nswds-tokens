import * as fs from 'fs'
import * as path from 'path'

export function green(msg: string) {
  return `\x1b[32m${msg}\x1b[0m`
}

export function brightRed(msg: string) {
  return `\x1b[1;31m${msg}\x1b[0m`
}

export function areSetsEqual<T>(a: Set<T>, b: Set<T>) {
  return a.size === b.size && [...a].every((item) => b.has(item))
}

const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export function assertSafeObjectKey(key: string, context: string) {
  if (!key || UNSAFE_OBJECT_KEYS.has(key)) {
    throw new Error(`Invalid ${context}: "${key}"`)
  }

  return key
}

export function assertSafePathSegment(segment: string, context: string) {
  if (
    !segment ||
    segment === '.' ||
    segment === '..' ||
    segment.includes(path.posix.sep) ||
    segment.includes(path.win32.sep) ||
    segment.includes('\0')
  ) {
    throw new Error(`Invalid ${context}: "${segment}"`)
  }

  return segment
}

export function resolvePathInsideDirectory(
  targetPath: string,
  allowedRoot: string,
  context: string,
) {
  if (!targetPath) {
    throw new Error(`A ${context} is required`)
  }

  const allowedRootRealPath = fs.realpathSync.native(allowedRoot)
  const resolvedPath = path.resolve(allowedRootRealPath, targetPath)
  const relativePath = path.relative(allowedRootRealPath, resolvedPath)

  if (
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`Invalid ${context}: "${targetPath}" must stay within ${allowedRoot}`)
  }

  let existingPath = resolvedPath
  while (!fs.existsSync(existingPath)) {
    const parentPath = path.dirname(existingPath)
    if (parentPath === existingPath) {
      throw new Error(`Invalid ${context}: "${targetPath}" must stay within ${allowedRoot}`)
    }
    existingPath = parentPath
  }

  const existingRealPath = fs.realpathSync.native(existingPath)
  const existingRelativePath = path.relative(allowedRootRealPath, existingRealPath)

  if (
    existingRelativePath === '..' ||
    existingRelativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(existingRelativePath)
  ) {
    throw new Error(`Invalid ${context}: "${targetPath}" must stay within ${allowedRoot}`)
  }

  return resolvedPath
}
