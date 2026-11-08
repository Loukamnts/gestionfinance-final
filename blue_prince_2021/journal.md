# Journal — recherche du trailer d'annonce Blue Prince (avril 2021)

Session du 2026-11-08. **Résultat : aucun fichier récupéré.** Raison principale :
le réseau de la session (environnement « Code », accès *limité*, aucun hôte autorisé)
bloque tous les sites nécessaires. La demande d'ajout d'hôtes a été refusée par le
service des environnements.

## Accès réseau testé (curl depuis le conteneur)
| URL | Résultat |
|---|---|
| https://web.archive.org/cdx/search/cdx?url=store.steampowered.com/app/1569580* | bloqué (connect_rejected par le proxy) |
| https://store.steampowered.com/api/appdetails?appids=1569580 | bloqué |
| https://cdn.akamai.steamstatic.com/ | bloqué |
| https://video.akamai.steamstatic.com/ | bloqué |
| https://player.vimeo.com/video/538348248 | bloqué |
| https://vimeo.com/538348248 | bloqué |
| https://www.youtube.com/ | bloqué |
| https://archive.org/ , https://archive.ph/ | bloqué |
| https://www.reddit.com/ | bloqué |
| https://www.gematsu.com/ , https://blueprincegame.com/ | bloqué |
| https://pypi.org/ , https://github.com/ | OK (seuls hôtes ouverts) |

WebFetch (outil de lecture web) : refusé pour web.archive.org ; DNS non résolu pour
store.steampowered.com → même restriction.

## Piste 1 — Steam : NON TESTÉE (bloquée)
CDX Wayback pour `store.steampowered.com/app/1569580` et `.../api/appdetails?appids=1569580`,
puis test des fichiers `movie480.webm` / `movie_max.mp4` sur les CDN : impossible.
Indice indirect (recherche web) : SteamDB liste aujourd'hui seulement des trailers 2025
(Atmospheric 10/04/2025, Accolades 17/06/2025, Mac 21/10/2025) → l'ancien trailer n'est
probablement plus dans l'API actuelle, mais il faut le vérifier dans les captures 2021.
Fiche créée sur SteamDB le 03/03/2021 (changelist #10880454).

## Piste 2 — Vimeo 538348248 : NON TESTÉE (bloquée)
CDX pour vimeo.com/538348248, player.vimeo.com/video/538348248(/config) et yt-dlp : impossible.

## Piste 3 — blueprincegame.com / dogubomb.com (captures 2021) : NON TESTÉE (bloquée)

## Piste 4 — Réseaux sociaux : recherche web uniquement
Aucun tweet, post Reddit ou Facebook d'avril 2021 avec la vidéo n'est remonté.

## Piste 5 — Réuploads (recherche web, pas de yt-dlp possible)
Requêtes : « Blue Prince Dogubomb announcement trailer 2021 », « "Blue Prince" trailer April
2021 youtube Dogubomb », « "Your bequest has begun" trailer », « Bequest Dogubomb trailer »,
« Blue Prince 1569580 steam trailer 2021 ».
Résultats : uniquement des trailers 2024-2025 (Console Announcement, Release Date, Launch,
macOS, Accolades, Xbox) — **écartés, ce n'est pas le trailer 2021.**
Aucun réupload du trailer 2021 trouvé.

## Pour reprendre
1. Autoriser dans l'environnement (menu environnement → Edit → Network access, ou
   passer en accès « Full ») au minimum : web.archive.org, store.steampowered.com,
   cdn.akamai.steamstatic.com, cdn.cloudflare.steamstatic.com,
   video.akamai.steamstatic.com, player.vimeo.com, vimeo.com.
   (YouTube/X demandent des domaines CDN à joker → accès « Full » plus simple.)
2. Lancer `bash blue_prince_2021/run_all.sh` : il teste toutes les pistes, télécharge
   ce qu'il trouve et extrait des images clés.
3. Pistes humaines : Discord de Dogubomb / Blue Prince, poster une demande sur
   r/BluePrince ou r/Games, écrire à Dogubomb (Tonda Ros) — le studio a forcément le fichier.
