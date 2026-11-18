// Floor's service worker, for the web app on a phone's home screen. It does one job: shows the
// alerts Floor's server sends, and opens the right screen when one is tapped. It caches nothing:
// the app always loads fresh, so nobody is left on an old version.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let alert = {};
  try {
    alert = event.data ? event.data.json() : {};
  } catch {
    alert = {};
  }
  const title = alert.title || "Floor";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: alert.body || "",
      data: alert.data || {},
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: alert.data && alert.data.id ? `${alert.data.type}-${alert.data.id}` : undefined,
    }),
  );
});

/** The screen an alert opens. Kept in step with routeFor in src/features/alerts/logic.ts. */
function screenFor(data) {
  const id = typeof data.id === "string" ? encodeURIComponent(data.id) : "";
  const space = typeof data.space === "string" ? `space=${encodeURIComponent(data.space)}` : "";
  const join = (path, query) => (query ? `${path}?${query}` : path);
  if (data.type === "lesson" && id) return join("/lesson", `id=${id}${space ? `&${space}` : ""}`);
  if ((data.type === "live" || data.type === "class") && id) return join("/live", `id=${id}${space ? `&${space}` : ""}`);
  if (data.type === "report") return join("/manage/reported", space);
  return join("/", space);
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(screenFor(event.notification.data || {}), self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((open) => {
      for (const client of open) {
        if ("focus" in client) {
          return client.focus().then((focused) => (focused && "navigate" in focused ? focused.navigate(target) : undefined));
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
