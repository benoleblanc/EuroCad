// EuroCad service worker.
//
// La v1 était en cache-first sur index.html : une fois installée, l'app ne
// consultait plus jamais le réseau pour sa propre page et restait figée sur la
// version du jour de l'installation. Aucun déploiement ne pouvait l'atteindre.
//
// La page passe donc en réseau d'abord, avec repli sur le cache — et un délai
// court pour ne pas sacrifier le démarrage quand la connexion traîne. Les
// ressources fixes (icônes, manifeste) restent en cache d'abord.
var CACHE = "eurocad-v2";
var DOC_TIMEOUT = 1200;   // au-delà, on sert le cache et on met à jour derrière

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

function put(req, resp){
  if(!resp || !resp.ok || resp.type !== "basic") return;
  var copy = resp.clone();
  caches.open(CACHE).then(function(c){ c.put(req, copy); });
}

// Réseau d'abord, cache au bout de DOC_TIMEOUT ou si le réseau échoue.
function docStrategy(req){
  return new Promise(function(resolve){
    var served = false;
    var fromCache = function(){
      return caches.match(req).then(function(hit){
        return hit || caches.match("./index.html");
      });
    };

    var timer = setTimeout(function(){
      if(served) return;
      fromCache().then(function(hit){
        if(served || !hit) return;
        served = true;
        resolve(hit);       // la réponse réseau mettra quand même le cache à jour
      });
    }, DOC_TIMEOUT);

    // « no-cache » force la revalidation auprès du serveur. Sans ça, le cache
    // HTTP du navigateur peut resservir l'ancienne page sans rien demander :
    // GitHub Pages envoie max-age=600 sur le HTML, ce qui retarderait toute
    // mise à jour de dix minutes malgré la stratégie réseau d'abord.
    fetch(req, { cache: "no-cache" })
      .then(function(resp){
        clearTimeout(timer);
        put(req, resp);
        if(!served){ served = true; resolve(resp); }
      })
      .catch(function(){
        clearTimeout(timer);
        if(served) return;
        fromCache().then(function(hit){
          served = true;
          resolve(hit || Response.error());
        });
      });
  });
}

self.addEventListener("fetch", function(e){
  var req = e.request;
  if(req.method !== "GET") return;

  // L'API de taux ne passe jamais par le cache : la fraîcheur est gérée côté
  // page via localStorage, et une réponse périmée serait trompeuse.
  var url = new URL(req.url);
  if(url.origin !== self.location.origin) return;

  if(req.mode === "navigate" || req.destination === "document"){
    e.respondWith(docStrategy(req));
    return;
  }

  // Ressources fixes : cache d'abord, rafraîchies en arrière-plan.
  e.respondWith(
    caches.match(req).then(function(hit){
      var net = fetch(req).then(function(resp){
        put(req, resp);
        return resp;
      }).catch(function(){ return hit; });
      return hit || net;
    })
  );
});
