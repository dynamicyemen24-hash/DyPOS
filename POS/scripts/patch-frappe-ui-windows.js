// Idempotent patch for frappe-ui/vite on Windows.
//
// node_modules/frappe-ui/vite/utils.js walks up the directory tree looking for
// a frappe-bench layout (`sites` + `apps`). The published source terminates the
// walk with `while (currentDir !== '/')`. On POSIX that condition eventually
// stops at the filesystem root; on Windows the root is "C:\" which is NEVER
// equal to "/", so importing frappe-ui/vite spins forever and both `vite build`
// and `vite dev` hang before printing anything.
//
// Two published variants are patched:
//   1. a version with `findBenchPath` / `findAppName` helpers,
//   2. a version with inlined `getCommonSiteConfig` / `findAppsFolder`.
//
// The fix terminates each walk when `path.resolve(dir, '..')` no longer
// changes (i.e. we reached a drive root). Safe to re-run; does nothing if the
// fix is already applied.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const utilsPath = path.resolve(here, "../node_modules/frappe-ui/vite/utils.js")

if (!fs.existsSync(utilsPath)) {
	console.warn("[patch-frappe-ui-windows] utils.js not found, skipping")
	process.exit(0)
}

const source = fs.readFileSync(utilsPath, "utf8")

const replacements = [
	// Variant 1: findBenchPath
	[
		`export function findBenchPath() {
  let currentDir = path.resolve('.')
  while (currentDir !== '/') {
    if (
      fs.existsSync(path.join(currentDir, 'sites')) &&
      fs.existsSync(path.join(currentDir, 'apps'))
    ) {
      return currentDir
    }
    currentDir = path.resolve(currentDir, '..')
  }
  return null
}`,
		`export function findBenchPath() {
  let currentDir = path.resolve('.')
  while (true) {
    if (
      fs.existsSync(path.join(currentDir, 'sites')) &&
      fs.existsSync(path.join(currentDir, 'apps'))
    ) {
      return currentDir
    }
    const parent = path.resolve(currentDir, '..')
    if (parent === currentDir) {
      return null
    }
    currentDir = parent
  }
}`,
	],
	// Variant 1: findAppName
	[
		`let currentDir = path.resolve('.')
  while (currentDir !== '/') {
    const parent = path.dirname(currentDir)
    if (path.resolve(parent) === path.resolve(appsFolder)) {
      return path.basename(currentDir)
    }
    currentDir = parent
  }`,
		`let currentDir = path.resolve('.')
  while (true) {
    const parent = path.dirname(currentDir)
    if (path.resolve(parent) === path.resolve(appsFolder)) {
      return path.basename(currentDir)
    }
    if (parent === currentDir) {
      return null
    }
    currentDir = parent
  }`,
	],
	// Variant 2: getCommonSiteConfig (inlined)
	[
		`export function getCommonSiteConfig() {
  let currentDir = path.resolve('.')
  // traverse up till we find frappe-bench with sites directory
  while (currentDir !== '/') {
    if (
      fs.existsSync(path.join(currentDir, 'sites')) &&
      fs.existsSync(path.join(currentDir, 'apps'))
    ) {
      let configPath = path.join(currentDir, 'sites', 'common_site_config.json')
      if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath))
      }
      return null
    }
    currentDir = path.resolve(currentDir, '..')
  }
  return null
}`,
		`export function getCommonSiteConfig() {
  let currentDir = path.resolve('.')
  // traverse up till we find frappe-bench with sites directory
  while (true) {
    if (
      fs.existsSync(path.join(currentDir, 'sites')) &&
      fs.existsSync(path.join(currentDir, 'apps'))
    ) {
      let configPath = path.join(currentDir, 'sites', 'common_site_config.json')
      if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath))
      }
      return null
    }
    const parent = path.resolve(currentDir, '..')
    if (parent === currentDir) {
      return null
    }
    currentDir = parent
  }
}`,
	],
	// Variant 2: findAppsFolder
	[
		`export function findAppsFolder() {
  let currentDir = process.cwd()
  while (currentDir !== '/') {
    if (
      fs.existsSync(path.join(currentDir, 'apps')) &&
      fs.existsSync(path.join(currentDir, 'sites'))
    ) {
      return path.join(currentDir, 'apps')
    }
    currentDir = path.resolve(currentDir, '..')
  }
  return null
}`,
		`export function findAppsFolder() {
  let currentDir = process.cwd()
  while (true) {
    if (
      fs.existsSync(path.join(currentDir, 'apps')) &&
      fs.existsSync(path.join(currentDir, 'sites'))
    ) {
      return path.join(currentDir, 'apps')
    }
    const parent = path.resolve(currentDir, '..')
    if (parent === currentDir) {
      return null
    }
    currentDir = parent
  }
}`,
	],
]

let next = source
let changed = 0

for (const [oldText, newText] of replacements) {
	if (next.includes(oldText)) {
		next = next.replace(oldText, newText)
		changed += 1
	}
}

if (changed > 0) {
	fs.writeFileSync(utilsPath, next, "utf8")
	console.log(
		`[patch-frappe-ui-windows] patched ${changed} loop(s) in ${utilsPath}`,
	)
} else {
	console.log("[patch-frappe-ui-windows] already patched, nothing to do")
}

process.exit(0)
