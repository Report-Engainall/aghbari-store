/* Aghbari offline shell. Financial data, auth responses and Supabase traffic are never cached. */
const CACHE_NAME = 'aghbari-shell-v5';
const SHELL = ['/', '/manifest.webmanifest', '/favicon.ico', '/icons/aghbari-icon-192.svg', '/icons/aghbari-icon-512.svg'];

const STATIC_ASSET_MIME_POLICIES = [
  { extension: /\.js$/i, types: ['application/javascript', 'text/javascript', 'application/ecmascript', 'text/ecmascript', 'application/x-javascript'] },
  { extension: /\.css$/i, types: ['text/css'] },
  { extension: /\.svg$/i, types: ['image/svg+xml'] },
  { extension: /\.png$/i, types: ['image/png'] },
  { extension: /\.jpe?g$/i, types: ['image/jpeg'] },
  { extension: /\.webp$/i, types: ['image/webp'] },
  { extension: /\.woff2?$/i, types: ['font/woff', 'font/woff2', 'application/font-woff', 'application/font-woff2', 'application/x-font-woff'] },
  { extension: /\.ico$/i, types: ['image/x-icon', 'image/vnd.microsoft.icon', 'image/ico'] },
];

function responseMimeType(response) {
  return (response.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
}

function hasExpectedStaticAssetMimeType(pathname, contentType) {
  const mimeType = (contentType || '').split(';', 1)[0].trim().toLowerCase();
  const policy = STATIC_ASSET_MIME_POLICIES.find((entry) => entry.extension.test(pathname));
  return Boolean(policy && policy.types.includes(mimeType));
}

function isHtmlResponse(response) {
  const mimeType = responseMimeType(response);
  return mimeType === 'text/html' || mimeType === 'application/xhtml+xml';
}

// Diagnostics expose only safe metadata, never raw exception payloads or request credentials.
function diagnosticErrorType(error) {
  const tag = Object.prototype.toString.call(error);
  if (error instanceof TypeError || tag === '[object TypeError]') return 'TypeError';
  if (error instanceof Error || tag === '[object Error]') return 'Error';
  return 'UnknownError';
}

function reportServiceWorkerDiagnostic(level, code, resource, error) {
  const message = {
    type: 'aghbari:service-worker-diagnostic',
    level,
    code,
    resource,
    ...(error ? { errorType: diagnosticErrorType(error) } : {}),
  };
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then((clients) => {
      clients.forEach((client) => client.postMessage(message));
    })
    .catch(() => undefined);
}

function isExpectedShellMimeType(pathname, response) {
  if (pathname === '/') return isHtmlResponse(response);
  if (pathname === '/manifest.webmanifest') {
    const mimeType = responseMimeType(response);
    return mimeType === 'application/manifest+json' || mimeType === 'application/json';
  }
  return hasExpectedStaticAssetMimeType(pathname, response.headers.get('content-type'));
}

async function cacheShellAsset(url, cache) {
  try {
    const response = await fetch(url);
    if (!response.ok || response.type !== 'basic' || !isExpectedShellMimeType(url, response)) return;
    await cache.put(url, response);
  } catch (error) {
    await reportServiceWorkerDiagnostic('warning', 'optional-shell-asset-not-cached', 'shell', error);
  }
}

async function installShell() {
  try {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(SHELL.map((url) => cacheShellAsset(url, cache)));
  } catch (error) {
    await reportServiceWorkerDiagnostic('error', 'shell-install-cache-failed', 'shell', error);
  }

}

self.addEventListener('install', (event) => {
  event.waitUntil(installShell());
});

async function removeObsoleteShellCaches() {
  const keys = await caches.keys();
  const obsolete = keys.filter((key) => key.startsWith('aghbari-shell-') && key !== CACHE_NAME);
  await Promise.all(obsolete.map(async (cacheName) => {
    try {
      await caches.delete(cacheName);
    } catch (error) {
      await reportServiceWorkerDiagnostic('warning', 'obsolete-shell-cache-removal-failed', 'cache', error);
    }
  }));
}

async function activateShell() {
  try {
    await removeObsoleteShellCaches();
  } catch (error) {
    await reportServiceWorkerDiagnostic('error', 'shell-activation-cache-cleanup-failed', 'lifecycle', error);
  }

  try {
    await self.clients.claim();
  } catch (error) {
    await reportServiceWorkerDiagnostic('error', 'service-worker-client-claim-failed', 'lifecycle', error);
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(activateShell());
});

self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'AGHBARI_ACTIVATE_UPDATE') return;
  event.waitUntil(
    self.skipWaiting().catch((error) =>
      reportServiceWorkerDiagnostic('error', 'service-worker-skip-waiting-failed', 'lifecycle', error),
    ),
  );
});


async function cachedShellOrError(networkError) {
  if (networkError) {
    await reportServiceWorkerDiagnostic('warning', 'navigation-network-failed', 'navigation', networkError);
  }
  try {
    return (await caches.match('/')) || Response.error();
  } catch (error) {
    await reportServiceWorkerDiagnostic('error', 'cached-shell-lookup-failed', 'navigation', error);
    return Response.error();
  }
}

function cachePublicHomeResponse(event, response, isHomeNavigation) {
  if (!isHomeNavigation || !response.ok || !isHtmlResponse(response)) return;
  const homeResponse = response.clone();
  const cacheWrite = caches.open(CACHE_NAME)
    .then((cache) => cache.put('/', homeResponse))
    .catch((error) => reportServiceWorkerDiagnostic('warning', 'navigation-shell-cache-write-failed', 'navigation', error));
  event.waitUntil(cacheWrite);
}

function handleNavigationFetch(event, request, url) {
  const navigationResponse = fetch(request)
    .then((response) => {
      // Only the public home shell is cached; identity-bound deep routes stay network-only.
      cachePublicHomeResponse(event, response, url.pathname === '/');
      return response;
    })
    .catch((error) => cachedShellOrError(error));
  event.respondWith(navigationResponse);
}

function isCacheableStaticAsset(url, response) {
  return response.ok &&
    response.type === 'basic' &&
    url.pathname.startsWith('/assets/') &&
    /\.(js|css|svg|png|jpe?g|webp|woff2?|ico)$/i.test(url.pathname) &&
    hasExpectedStaticAssetMimeType(url.pathname, response.headers.get('content-type'));
}

function cacheStaticAssetResponse(event, request, response, url) {
  if (!isCacheableStaticAsset(url, response)) return;
  const cacheWrite = caches.open(CACHE_NAME)
    .then((cache) => cache.put(request, response.clone()))
    .catch((error) => reportServiceWorkerDiagnostic('warning', 'static-asset-cache-write-failed', 'static_asset', error));
  event.waitUntil(cacheWrite);
}

async function fetchStaticAsset(request, url, event) {
  try {
    const response = await fetch(request);
    // A missing JS asset can fall back to index.html with HTTP 200; never cache it as JS.
    cacheStaticAssetResponse(event, request, response, url);
    return response;
  } catch (error) {
    // Keep the rejection visible to the caller while recording a redacted diagnostic.
    await reportServiceWorkerDiagnostic('warning', 'static-asset-fetch-failed', 'static_asset', error);
    throw error;
  }
}

function refreshCachedAssetInBackground(event, networkResponse) {
  event.waitUntil(
    networkResponse.then(() => undefined).catch((error) =>
      reportServiceWorkerDiagnostic('warning', 'background-asset-refresh-failed', 'static_asset', error),
    ),
  );
}

async function respondWithCachedOrNetworkAsset(cached, event, request, url) {
  const networkResponse = fetchStaticAsset(request, url, event);
  if (cached) {
    // Serve the cache immediately while keeping refresh failures observable and handled.
    refreshCachedAssetInBackground(event, networkResponse);
    return cached;
  }

  try {
    return await networkResponse;
  } catch (error) {
    await reportServiceWorkerDiagnostic('error', 'static-asset-request-failed', 'static_asset', error);
    return Response.error();
  }
}

async function resolveStaticAssetResponse(request, event, url) {
  try {
    const cached = await caches.match(request);
    return await respondWithCachedOrNetworkAsset(cached, event, request, url);
  } catch (error) {
    await reportServiceWorkerDiagnostic('error', 'static-asset-cache-lookup-failed', 'static_asset', error);
    return Response.error();
  }
}

function handleStaticAssetFetch(event, request, url) {
  // respondWith must be called synchronously during the fetch event.
  event.respondWith(resolveStaticAssetResponse(request, event, url));
}

function shouldHandleSameOriginGet(request, url) {
  return request.method === 'GET' &&
    url.origin === self.location.origin &&
    !/\/(rest|auth|api|rpc|storage|functions)\//i.test(url.pathname);
}

function handleSameOriginGetFetch(event, request, url) {
  if (request.mode === 'navigate') {
    handleNavigationFetch(event, request, url);
    return;
  }
  handleStaticAssetFetch(event, request, url);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (!shouldHandleSameOriginGet(request, url)) return;
  handleSameOriginGetFetch(event, request, url);
});
