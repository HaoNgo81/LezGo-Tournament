const CACHE_NAME = "lezgo-padel-v2";
const SCOPE_PATH = new URL(self.registration.scope).pathname.replace(/\/$/, "");
const APP_SHELL_ROUTES = ["/", "/new-tournament", "/tournaments", "/templates", "/settings"];
const APP_SHELL = APP_SHELL_ROUTES.map((route) => `${SCOPE_PATH}${route}`);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
