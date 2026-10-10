import { readdir, readFile, stat } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const assetsDirectory = path.join(projectRoot, 'dist', 'assets')
const ENTRY_BUNDLE_BUDGET_BYTES = 500_000

const assetNames = await readdir(assetsDirectory)
const entryFiles = assetNames.filter(name => /^index-[\w-]+\.js$/.test(name))

if (entryFiles.length !== 1) {
  throw new Error(`Expected exactly one Vite entry JavaScript bundle; found ${entryFiles.length}.`)
}

const entryName = entryFiles[0]
const entryPath = path.join(assetsDirectory, entryName)
const [entryBytes, entryInfo] = await Promise.all([readFile(entryPath), stat(entryPath)])
const gzipBytes = gzipSync(entryBytes).byteLength

if (entryInfo.size <= 0) {
  throw new Error('The Vite entry JavaScript bundle is empty.')
}

if (entryInfo.size > ENTRY_BUNDLE_BUDGET_BYTES) {
  throw new Error(
    `Entry bundle budget exceeded: ${entryName} is ${entryInfo.size} bytes; budget is ${ENTRY_BUNDLE_BUDGET_BYTES} bytes. Add or repair route-level code splitting before raising this limit.`,
  )
}

console.log(
  `Bundle budget PASS: ${entryName} = ${entryInfo.size} bytes (${(entryInfo.size / 1000).toFixed(2)} kB), gzip ${gzipBytes} bytes; budget ${ENTRY_BUNDLE_BUDGET_BYTES} bytes.`,
)
