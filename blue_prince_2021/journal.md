# Journal — trailer d'annonce Blue Prince (avril 2021)

## RÉSULTAT : TROUVÉ ✅
**Fichier : `dl/blue_prince_trailer_2021_facebook.mp4`** (25 Mo, 1920×1080 VP9 + AAC, 23,976 i/s, **89,56 s**)

- Source : https://www.facebook.com/VideoGameTrailer/videos/blue-prince-trailer/2849778521935674/
  (page Facebook « Video Game Trailers », réupload d'époque, 65 vues)
- Mise en ligne : **20 avril 2021, 11:20:50 UTC** (timestamp 1618917650), le lendemain de l'article Gematsu.
- Description = texte du communiqué de 2021 (« Dogubomb, a commercial motion studio based in Hollywood, has announced Blue Prince… »).
- Téléchargé avec yt-dlp, format « hd ». Métadonnées complètes : `dl/blue_prince_trailer_2021_facebook.info.json`.

### Pourquoi c'est bien le trailer de 2021 (et pas un trailer 2024-2025)
- Date d'upload 20/04/2021 : aucun autre trailer de Blue Prince n'existait avant mars 2024.
- Durée 89,6 s ≈ 90 s, identique au réupload YouTube « New Games 2022 » (voir plus bas).
- Le carton d'ouverture dit **« PUBLISHER PRESENTS »** (texte provisoire : pas encore d'éditeur ;
  Raw Fury n'a signé qu'en mars 2024), puis **« GAME by DOGUBOMB »**.
- Contenu : visage de vieil homme (l'oncle Herbert), bureau, hall, cryptes, chapelle aux vitraux,
  boutique « Commissary » avec la pelle (« SHOVEL »), escalier en colimaçon, logo final Blue Prince.
- Images clés : `frames/planche_contact.jpg` (1 image / 8 s), `frames/fb_01.jpg` … `fb_11.jpg`, `frames/fin.jpg`.

## Autres candidates
- YouTube `q5qp3L11UV8` — chaîne AoWyrm, « BLUE PRINCE - Official Trailer | New Games 2022 », 90 s.
  https://www.youtube.com/watch?v=q5qp3L11UV8 — date approximative YouTube : « il y a 4 ans »
  (≈ fin 2021-2022), dans une compilation avec Destiny 2 The Witch Queen. Très probablement le
  même trailer. **Non téléchargée** : YouTube exige une connexion (« Sign in to confirm you're not
  a bot ») depuis ce serveur. Miniature : `frames/yt_q5qp_hqdefault.jpg`.
  → La version Facebook suffit ; celle-ci peut servir de deuxième copie, à télécharger depuis un PC perso.

## Pistes testées (2026-11-08)
| Piste | URL | Résultat |
|---|---|---|
| Steam API actuelle | https://store.steampowered.com/api/appdetails?appids=1569580 | 4 vidéos, toutes 2025 (257081399 Atmospheric, 257124607 Release, 257157755 Accolades, 257206238 Mac) |
| Steam actualités/événements | store.steampowered.com/events/ajaxgetpartnereventspageable/?appid=1569580 ; api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1569580 | rien avant le 21/03/2024 |
| Wayback CDX | web.archive.org/cdx/search/cdx?... | bloqué par le réseau de la session |
| Wayback via archive.org | archive.org/wayback/available?url=… | 429 Too Many Requests (répété) |
| arquivo.pt CDX | arquivo.pt/wayback/cdx?url=… | 403 |
| Vimeo yt-dlp | https://vimeo.com/538348248 | « only works when logged-in » |
| Vimeo player | https://player.vimeo.com/video/538348248 | « embed-only video » → la vidéo existe peut-être encore, restreinte au domaine. Contournement par faux référent **non tenté** (refusé par les garde-fous de la session) |
| Vimeo oEmbed | vimeo.com/api/oembed.json?url=https://vimeo.com/538348248 | 404 |
| Vimeo compte | vimeo.com/dogubomb | 404 |
| Gematsu (page actuelle) | gematsu.com/2021/04/atmospheric-puzzle-…-for-pc | intègre toujours player.vimeo.com/video/538348248 |
| VGChartz / Digitally Downloaded (avril 2021) | vgchartz.com/article/448402/… ; digitallydownloaded.net/2021/04/blue-prince-looks-gorgeous.html | pas de vidéo exploitable |
| blueprincegame.com | — | seulement l'Atmospheric Trailer (W2hB9PjugK0, 2024) |
| IGDB, MobyGames, PCGamingWiki, wiki.gg, SteamDB | — | 403 (Cloudflare) |
| Wikipedia | Blue_Prince_(video_game) | confirme l'ancien nom « Bequest », pas de vidéo |
| YouTube (yt-dlp ytsearch, ~15 requêtes) | logs/youtube_search*.txt | tout 2024-2025 sauf q5qp3L11UV8 (AoWyrm) |
| archive.org recherche d'items | advancedsearch.php?q="blue prince"… | rien de pertinent |
| Dailymotion API | api.dailymotion.com/videos?search=blue+prince+trailer | seulement un trailer 2024 (x9ac2jk) |
| Bilibili, Reddit API | — | connexion requise / refus |
| Recherche web → Facebook | **facebook.com/VideoGameTrailer/videos/…/2849778521935674** | ✅ **trailer 2021 téléchargé** |
