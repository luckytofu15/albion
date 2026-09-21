const CACHE = 'albion-profit-radar-v3';
const SHELL = ['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png','./data/recipes.demo.json'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;
  const u = new URL(event.request.url);
  if(u.origin !== self.location.origin) return; // Never cache live Albion API responses.
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(res=>{
    const copy=res.clone(); caches.open(CACHE).then(c=>c.put(event.request,copy)); return res;
  }).catch(()=>caches.match('./index.html'))));
});
