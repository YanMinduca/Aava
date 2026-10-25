/* Comunidade Aava — service worker das notificações push.
   Só cuida de mostrar avisos e abrir a página certa ao tocar; não guarda nada em cache. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_e) {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Comunidade Aava";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon-192.png",
      // Ícone pequeno da barra de status (Android): precisa ser uma silhueta; sem ele o Chrome mostra o dele.
      badge: "/badge-96.png",
      // Mesma "tag" = a notificação nova substitui a anterior do mesmo assunto, sem empilhar repetidas.
      tag: data.tag || undefined,
      data: { url: data.url || "/painel" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = (event.notification.data && event.notification.data.url) || "/painel";
  // Só abre páginas do próprio site.
  const target = new URL(raw, self.location.origin);
  const href = target.origin === self.location.origin ? target.href : self.location.origin + "/painel";
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of windows) {
        if (new URL(w.url).origin === self.location.origin) {
          await w.focus();
          if ("navigate" in w) {
            try {
              await w.navigate(href);
            } catch (_e) {
              /* se não der para navegar, a janela já foi focada */
            }
          }
          return;
        }
      }
      await self.clients.openWindow(href);
    })(),
  );
});
