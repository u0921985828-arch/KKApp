/* Service worker de PatwaLink.
   La app es un único fichero sin dependencias externas, así que la
   estrategia correcta es cachearlo todo en la instalación y servir
   siempre desde caché. No hay nada que refrescar en tiempo real. */

const CACHE = 'patwalink-v1';
const ARCHIVOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

self.addEventListener('install', e=>{
  e.waitUntil(
    caches.open(CACHE)
      .then(c=>c.addAll(ARCHIVOS))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate', e=>{
  e.waitUntil(
    caches.keys()
      .then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch', e=>{
  if(e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(r=>{
      if(r) return r;
      return fetch(e.request).then(resp=>{
        /* cachear lo que llegue nuevo, por si se sirve desde subrutas */
        if(resp && resp.status === 200 && resp.type === 'basic'){
          const copia = resp.clone();
          caches.open(CACHE).then(c=>c.put(e.request, copia));
        }
        return resp;
      }).catch(()=>caches.match('./index.html'));
    })
  );
});
