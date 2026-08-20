const CACHE_NAME = "lezgo-padel-v4";
const SCOPE_PATH = new URL(self.registration.scope).pathname.replace(/\/$/, "");
const APP_SHELL_ROUTES = ["/", "/new-tournament", "/tournaments", "/templates"];
const APP_SHELL = APP_SHELL_ROUTES.map((route) => `${SCOPE_PATH}${route}`);
const LOCAL_HOST_PATTERNS = [
  /^localhost$/,
  /^127\./,
  /^::1$/,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
];
const IS_LOCAL_OR_LAN = LOCAL_HOST_PATTERNS.some((pattern) => pattern.test(self.location.hostname));

if (IS_LOCAL_OR_LAN) {
  self.addEventListener("install", (event) => {
    event.waitUntil(self.skipWaiting());
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(
      caches.keys()
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        .then(() => self.clients.claim())
        .then(() => self.registration.unregister()),
    );
  });

  self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") return;
    event.respondWith(fetch(event.request));
  });
} else {
  self.addEventListener("install", (event) => {
    event.waitUntil(
      caches.open(CACHE_NAME)
        .then((cache) => cache.addAll(APP_SHELL))
        .then(() => self.skipWaiting()),
    );
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(
      caches.keys()
        .then((keys) => Promise.all(keys
          .filter((key) => key.startsWith("lezgo-padel-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))))
        .then(() => self.clients.claim()),
    );
  });

  self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") return;
    const requestUrl = new URL(event.request.url);
    const isNextStaticAsset = requestUrl.pathname.startsWith(`${SCOPE_PATH}/_next/static/`);

    if (isNextStaticAsset) {
      event.respondWith(fetch(event.request));
      return;
    }

    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
  });
}
