// Service worker do app do condutor: guarda o app no celular para abrir sem internet.
// Os dados ficam no próprio aplicativo (vex.js) e são enviados quando a internet volta.
var CACHE = 'vex-campo-v6';
var ARQUIVOS = ['./', 'index.html', 'diario.html', 'abastecimento.html', 'os.html', 'vex.js', 'config.js', 'vendor/supabase.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return Promise.all(ARQUIVOS.map(function (a) { return c.add(a).catch(function () { }); })); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(
    new Promise(function (ok, fail) {
      var t = setTimeout(function () { fail(new Error('timeout')); }, 5000);
      fetch(r).then(function (res) { clearTimeout(t); ok(res); }, function (er) { clearTimeout(t); fail(er); });
    }).then(function (res) {
      if (res && res.ok) { var cp = res.clone(); caches.open(CACHE).then(function (c) { c.put(r, cp); }); }
      return res;
    }).catch(function () {
      return caches.match(r, { ignoreSearch: true }).then(function (m) {
        return m || (r.mode === 'navigate' ? caches.match('index.html') : null) || new Response('Sem conexão com a internet.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      });
    })
  );
});
