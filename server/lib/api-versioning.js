/**
 * DyPOS API Versioning & Deprecation Policy
 * 
 * Semantic versioning for APIs, graceful deprecation, client migration support
 */

import { logger } from './logger.js';

const log = logger.create('APIVersioning');

// ──────────────────────────────────────────────────────────────────────────────
// Version Configuration
// ──────────────────────────────────────────────────────────────────────────────

export const API_VERSIONS = {
  // Format: 'v{major}.{minor}'
  // Major = breaking changes, Minor = additive changes
  SUPPORTED: ['v1.0', 'v1.1', 'v1.2', 'v1.3'],
  DEFAULT: 'v1.3',
  DEPRECATED: ['v1.0', 'v1.1'],
  SUNSET: {
    'v1.0': '2026-12-31',
    'v1.1': '2027-06-30',
  },
  LATEST: 'v1.3',
};

export const VERSION_HEADERS = {
  ACCEPT: 'Accept-Version',
  DEPRECATION: 'Deprecation',
  SUNSET: 'Sunset',
  LINK: 'Link',
};

/**
 * Parse version from Accept-Version header
 */
export function parseVersionHeader(header) {
  if (!header) return null;

  // Accept-Version: v1.3
  // Accept-Version: v1.2, v1.3;q=0.9
  const versions = header.split(',').map(v => {
    const [ver, q] = v.split(';').map(s => s.trim());
    const quality = q?.startsWith('q=') ? parseFloat(q.slice(2)) : 1.0;
    return { version: ver.replace(/^v?/, 'v'), quality };
  }).sort((a, b) => b.quality - a.quality);

  return versions;
}

/**
 * Resolve API version for request
 */
export function resolveApiVersion(req) {
  // 1. Explicit header (highest priority)
  const acceptVersion = req.headers['accept-version'] || req.headers['accept-version'];
  if (acceptVersion) {
    const parsed = parseVersionHeader(acceptVersion);
    for (const { version } of parsed) {
      if (API_VERSIONS.SUPPORTED.includes(version)) {
        return version;
      }
    }
  }

  // 2. Query parameter fallback
  if (req.query?.version && API_VERSIONS.SUPPORTED.includes(req.query.version)) {
    return req.query.version;
  }

  // 3. Default to latest
  return API_VERSIONS.DEFAULT;
}

/**
 * Check if version is deprecated
 */
export function isVersionDeprecated(version) {
  return API_VERSIONS.DEPRECATED.includes(version);
}

/**
 * Check if version is sunset (removed)
 */
export function isVersionSunset(version) {
  const sunsetDate = API_VERSIONS.SUNSET[version];
  if (!sunsetDate) return false;
  return new Date() > new Date(sunsetDate);
}

/**
 * Get sunset date for version
 */
export function getSunsetDate(version) {
  return API_VERSIONS.SUNSET[version] || null;
}

/**
 * Add deprecation headers to response
 */
export function addDeprecationHeaders(res, version) {
  if (isVersionDeprecated(version)) {
    res.setHeader(VERSION_HEADERS.DEPRECATION, 'true');
    const sunset = getSunsetDate(version);
    if (sunset) {
      res.setHeader(VERSION_HEADERS.SUNSET, sunset);
    }
    res.setHeader(VERSION_HEADERS.LINK, `<${process.env.DYPOS_API_DOCS_URL || '/api/docs'}?version=${API_VERSIONS.LATEST}>; rel="successor-version"`);
  }
}

/**
 * Version middleware
 */
export function versionMiddleware(req, res, next) {
  const version = resolveApiVersion(req);
  req.apiVersion = version;
  res.setHeader('API-Version', version);

  // Add deprecation headers if applicable
  addDeprecationHeaders(res, version);

  // Block sunset versions
  if (isVersionSunset(version)) {
    return res.status(410).json({
      error: 'API version sunset',
      message: `API version ${version} has been sunset. Please upgrade to ${API_VERSIONS.LATEST}.`,
      sunsetDate: getSunsetDate(version),
      latestVersion: API_VERSIONS.LATEST,
      docs: process.env.DYPOS_API_DOCS_URL || '/api/docs',
    });
  }

  next();
}

/**
 * Route versioning helper
 */
export function versionedRoute(app, version, path, handler) {
  const fullPath = `/api/${version}${path}`;
  app.use(fullPath, handler);
  log.debug('Registered versioned route', { version, path: fullPath });
}

/**
 * Mount versioned router
 */
export function mountVersionedRouter(app, version, router) {
  app.use(`/api/${version}`, versionMiddleware, router);
  log.info('Mounted versioned router', { version, paths: router.stack.map(s => s.route?.path).filter(Boolean) });
}

/**
 * Version negotiation for clients
 */
export function negotiateVersion(clientVersions) {
  // Client sends supported versions, server picks best match
  for (const clientVer of clientVersions) {
    if (API_VERSIONS.SUPPORTED.includes(clientVer)) {
      return clientVer;
    }
  }
  return API_VERSIONS.DEFAULT;
}

/**
 * Get version info for client
 */
export function getVersionInfo() {
  return {
    supported: API_VERSIONS.SUPPORTED,
    default: API_VERSIONS.DEFAULT,
    latest: API_VERSIONS.LATEST,
    deprecated: API_VERSIONS.DEPRECATED.map(v => ({
      version: v,
      sunsetDate: API_VERSIONS.SUNSET[v],
    })),
    docs: process.env.DYPOS_API_DOCS_URL || '/api/docs',
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Response Transformation by Version
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Transform response based on API version
 * Allows gradual schema evolution
 */
export function transformResponse(data, fromVersion, toVersion) {
  if (fromVersion === toVersion) return data;

  // Example transformations
  const transformers = {
    'v1.0': {
      'v1.1': (data) => ({
        ...data,
        // v1.1 adds new fields
        metadata: data.metadata || { created: data.created_at },
      }),
      'v1.2': (data) => ({
        ...data,
        metadata: data.metadata || { created: data.created_at },
        // v1.2 changes field names
        userId: data.user_id,
        tenantId: data.tenant_id,
      }),
      'v1.3': (data) => ({
        ...data,
        metadata: data.metadata || { created: data.created_at },
        userId: data.user_id,
        tenantId: data.tenant_id,
        // v1.3 adds pagination
        pagination: data.pagination || { page: 1, limit: 50, total: data.total || 0 },
      }),
    },
    'v1.1': {
      'v1.2': (data) => ({
        ...data,
        userId: data.user_id,
        tenantId: data.tenant_id,
      }),
      'v1.3': (data) => ({
        ...data,
        userId: data.user_id,
        tenantId: data.tenant_id,
        pagination: data.pagination || { page: 1, limit: 50, total: data.total || 0 },
      }),
    },
    'v1.2': {
      'v1.3': (data) => ({
        ...data,
        pagination: data.pagination || { page: 1, limit: 50, total: data.total || 0 },
      }),
    },
  };

  const transformer = transformers[fromVersion]?.[toVersion];
  if (!transformer) return data;

  if (Array.isArray(data)) {
    return data.map(transformer);
  }
  return transformer(data);
}

/**
 * Transform request based on version
 */
export function transformRequest(data, fromVersion, toVersion) {
  // Reverse of response transformation
  if (fromVersion === toVersion) return data;

  const reverseTransformers = {
    'v1.1': {
      'v1.0': (data) => {
        const { metadata, ...rest } = data;
        return rest;
      },
    },
    'v1.2': {
      'v1.0': (data) => {
        const { metadata, userId, tenantId, ...rest } = data;
        return { ...rest, user_id: userId, tenant_id: tenantId };
      },
      'v1.1': (data) => {
        const { userId, tenantId, ...rest } = data;
        return { ...rest, user_id: userId, tenant_id: tenantId };
      },
    },
    'v1.3': {
      'v1.0': (data) => {
        const { metadata, userId, tenantId, pagination, ...rest } = data;
        return { ...rest, user_id: userId, tenant_id: tenantId };
      },
      'v1.1': (data) => {
        const { userId, tenantId, pagination, ...rest } = data;
        return { ...rest, user_id: userId, tenant_id: tenantId };
      },
      'v1.2': (data) => {
        const { pagination, ...rest } = data;
        return rest;
      },
    },
  };

  const transformer = reverseTransformers[fromVersion]?.[toVersion];
  if (!transformer) return data;
  return transformer(data);
}