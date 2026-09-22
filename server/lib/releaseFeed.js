/** DyPOS Release Feed v1.32.0 — single feed powering self-update on all devices.
 *
 * Clients (PWA on mobile/desktop) poll this feed to learn:
 *   1. Is there a newer release than the running build?
 *   2. What changed and what is the benefit to the merchant?
 * served from version.json + release.json so Cloudflare deploys
 * propagate automatically — no client code change per release.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION } from './version.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// server/lib -> server/../DyPOS/public/pos
const POS_PUBLIC_DIR = join(__dirname, '..', '..', 'DyPOS', 'public', 'pos');

function readJson(name, fallback) {
  try {
    const raw = readFileSync(join(POS_PUBLIC_DIR, name), 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

const SEVERITIES = Object.freeze(['optional', 'recommended', 'critical']);

function normalizeSeverity(value) {
  const s = String(value || 'recommended').toLowerCase();
  return SEVERITIES.includes(s) ? s : 'recommended';
}

/** Unified release feed: code version wins, static files enrich. */
export function getReleaseFeed() {
  const versionFile = readJson('version.json', {});
  const releaseFile = readJson('release.json', {});
  return {
    version: VERSION,
    build: versionFile.build || `DyPOS-${VERSION}`,
    publishedAt: releaseFile.publishedAt || versionFile.timestamp || null,
    target: releaseFile.target || 'https://dypos.smartportssoft.com/',
    severity: normalizeSeverity(releaseFile.severity),
    minVersion: String(releaseFile.minVersion || ''),
    title: releaseFile.title || 'تحديث DyPOS الجديد متوفر الآن',
    highlights: Array.isArray(releaseFile.highlights) ? releaseFile.highlights : [],
  };
}

/** Publish hook: stamp a new release without redeploying code. */
export function publishRelease({ version, highlights, title, severity, minVersion }) {
  const feed = {
    version: String(version || VERSION),
    publishedAt: new Date().toISOString(),
    target: 'https://dypos.smartportssoft.com/',
    severity: normalizeSeverity(severity),
    minVersion: String(minVersion || ''),
    title: String(title || 'تحديث DyPOS الجديد متوفر الآن'),
    highlights: Array.isArray(highlights) ? highlights.slice(0, 20) : [],
  };
  writeFileSync(join(POS_PUBLIC_DIR, 'release.json'), JSON.stringify(feed, null, 2) + '\n');
  const versionStamp = {
    version: feed.version,
    build: `DyPOS-${feed.version}-published`,
    timestamp: feed.publishedAt,
    buildDate: new Date(feed.publishedAt).toDateString(),
    target: feed.target,
  };
  writeFileSync(join(POS_PUBLIC_DIR, 'version.json'), JSON.stringify(versionStamp, null, 2) + '\n');
  return feed;
}

export default { getReleaseFeed, publishRelease };
