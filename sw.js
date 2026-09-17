// EuroCad service worker — shell en cache-first, taux jamais mis en cache.
var CACHE = "eurocad-v1";
var SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];

self.addEventListener("install", function(e){
  e.waitUntil(
    caches.open(CACHE)
      .then(function(c){ return c.addAll(SHELL); })
      .then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function(e){
  e.waitUntil(
    caches.keys()
      .then(function(keys){
        return Promise.all(keys.map(function(k){
          return k === CACHE ? null : caches.delete(k);
        }));
      })
      .then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function(e){
  var req = e.request;
  if(req.method !== "GET") return;

  // L'API de taux ne passe jamais par le cache : la fraîcheur est gérée
  // côté page via localStorage, et une réponse périmée serait trompeuse.
  var url = new URL(req.url);
  if(url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(req).then(function(hit){
      if(hit) return hit;
      return fetch(req).then(function(resp){
        if(resp && resp.ok && resp.type === "basic"){
          var copy = resp.clone();
          caches.open(CACHE).then(function(c){ c.put(req, copy); });
        }
        return resp;
      }).catch(function(){
        // Navigation hors-ligne vers une URL non cachée : on sert l'app.
        if(req.mode === "navigate") return caches.match("./index.html");
        throw new Error("offline");
      });
    })
  );
});
