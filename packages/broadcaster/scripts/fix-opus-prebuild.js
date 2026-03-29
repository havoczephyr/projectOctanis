/**
 * @electron/rebuild creates the prebuild directory with a literal
 * "{libc_version}" in the name on macOS. The module expects "unknown".
 * This script creates a symlink to fix the mismatch.
 */
const { readdirSync, symlinkSync, existsSync } = require('fs')
const { join } = require('path')

const prebuildDir = join(__dirname, '..', '..', '..', 'node_modules', '@discordjs', 'opus', 'prebuild')

if (!existsSync(prebuildDir)) {
  console.log('[fix-opus-prebuild] No prebuild directory found, skipping')
  process.exit(0)
}

const dirs = readdirSync(prebuildDir)
const broken = dirs.find(d => d.includes('{libc_version}'))
if (!broken) {
  console.log('[fix-opus-prebuild] No {libc_version} directory found, skipping')
  process.exit(0)
}

const fixed = broken.replace('{libc_version}', 'unknown')
const fixedPath = join(prebuildDir, fixed)

if (existsSync(fixedPath)) {
  console.log('[fix-opus-prebuild] Symlink already exists:', fixed)
  process.exit(0)
}

symlinkSync(broken, fixedPath)
console.log('[fix-opus-prebuild] Created symlink:', fixed, '->', broken)
