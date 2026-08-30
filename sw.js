// Planova Service Worker v2 — PWA + Push Notifications

const CACHE_NAME = "planova-v2";
const OFFLINE_URLS = [
  "./index.html",
  "./tasks.html",
  "./exams.html",
  "./study-plan.html",
  "./performance.html",
  "./notifications.html",
  "./schedule.html",
  "./admin.html",
  "./reset-password.html",
  "./confirm-email.html",
  "./styles.css",
  "./script.js",
  "./manifest.json",
  "./assets/logo.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
];

// Install: cache all core assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_URLS))
  );
  self.skipWaiting();
});

// Activate: remove old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  event.waitUntil(self.clients.claim());
});

// Fetch: network-first for Supabase API, cache-first for assets
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Always go to network for Supabase API calls
  if (url.hostname.includes("supabase.co")) return;

  // Network-first for HTML (always get latest)
  if (event.request.destination === "document") {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for everything else (CSS, JS, images)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        if (!res || res.status !== 200) return res;
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return res;
      });
    })
  );
});

// Messages from the page (sendBrowserNotification)
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "NOTIFY") {
    self.registration.showNotification(data.title || "Planova", {
      body: data.body || "",
      icon: data.icon || "./assets/icon-192.png",
      badge: "./assets/icon-96.png",
      tag: data.title,
      renotify: true,
      vibrate: [100, 50, 100],
    });
  }
});

// Notification click — focus or open app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url.includes(self.registration.scope));
      if (existing) return existing.focus();
      return self.clients.openWindow("./index.html");
    })
  );
});

// Periodic Background Sync (Chrome/Edge PWA installed only)
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "planova-deadline-check") {
    event.waitUntil(
      self.registration.showNotification("Planova", {
        body: "Open Planova to check your latest tasks and exam deadlines.",
        icon: "./assets/icon-192.png",
        badge: "./assets/icon-96.png",
        tag: "planova-periodic",
      })
    );
  }
});

// Native Web Push support (future-ready)
self.addEventListener("push", (event) => {
  let payload = { title: "Planova", body: "You have a new update." };
  try { if (event.data) payload = event.data.json(); } catch (e) {
    if (event.data) payload.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "Planova", {
      body: payload.body || "",
      icon: "./assets/icon-192.png",
      badge: "./assets/icon-96.png",
    })
  );
});
