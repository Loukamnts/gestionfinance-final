#!/usr/bin/env bash
# Teste toutes les pistes pour le trailer Blue Prince d'avril 2021.
# Nécessite un accès réseau à web.archive.org, Steam, Vimeo. Usage : bash run_all.sh
set -u
cd "$(dirname "$0")"; mkdir -p dl frames logs
WB=https://web.archive.org
log(){ echo "[$(date -u +%FT%TZ)] $*" | tee -a logs/run.log; }
cdx(){ curl -s "$WB/cdx/search/cdx?url=$1&from=2021&to=2022&output=txt&collapse=digest" ; }

log "== 1. Steam appdetails (actuel)"
curl -s "https://store.steampowered.com/api/appdetails?appids=1569580" > logs/appdetails_now.json
python3 -c 'import json,sys;d=json.load(open("logs/appdetails_now.json"))["1569580"]["data"];[print(m["id"],m["name"]) for m in d.get("movies",[])]' | tee -a logs/run.log

log "== 1b. Captures Wayback 2021 de Steam"
: > logs/steam_ids.txt
for u in "store.steampowered.com/app/1569580*" "store.steampowered.com/api/appdetails*appids=1569580*"; do
  cdx "$u" | tee -a logs/cdx_steam.txt | while read -r _ ts orig _; do
    curl -s "$WB/web/${ts}id_/$orig" | grep -oE '(steam/apps|store_trailers)/[0-9]+/[^"'"'"' ]*|"id":[ ]?[0-9]{6,}' >> logs/steam_ids.txt
  done
done
sort -u logs/steam_ids.txt | tee -a logs/run.log
grep -oE '(steam/apps|store_trailers)/[0-9]{6,}' logs/steam_ids.txt | grep -oE '[0-9]+$' | sort -u | grep -v 1569580 > logs/movie_ids.txt
for id in $(cat logs/movie_ids.txt); do
  for host in cdn.akamai.steamstatic.com cdn.cloudflare.steamstatic.com video.akamai.steamstatic.com; do
    for f in movie_max.mp4 movie480.mp4 movie_max.webm movie480.webm movie480_vp9.webm movie_max_vp9.webm; do
      url="https://$host/steam/apps/$id/$f"
      c=$(curl -s -o /dev/null -w '%{http_code}' -I "$url"); log "$c $url"
      [ "$c" = 200 ] && curl -s -o "dl/steam_${id}_$f" "$url"
      w=$(curl -s -o /dev/null -w '%{http_code}' -I "$WB/web/2021id_/$url"); log "wayback $w $url"
      [ "$w" = 200 ] && [ ! -s "dl/steam_${id}_$f" ] && curl -sL -o "dl/wb_steam_${id}_$f" "$WB/web/2021id_/$url"
    done
  done
done

log "== 2. Vimeo 538348248"
for u in "vimeo.com/538348248*" "player.vimeo.com/video/538348248*"; do cdx "$u" | tee -a logs/cdx_vimeo.txt; done
while read -r _ ts orig _; do
  curl -s "$WB/web/${ts}id_/$orig" | grep -oE 'https?://[^"]*vimeocdn[^"]*\.mp4[^"]*|https?://[^"]*akamaized\.net[^"]*\.mp4[^"]*' >> logs/vimeo_urls.txt
done < logs/cdx_vimeo.txt
sort -u logs/vimeo_urls.txt 2>/dev/null | while read -r v; do
  c=$(curl -s -o /dev/null -w '%{http_code}' -I "$WB/web/2021id_/$v"); log "wayback $c $v"
  [ "$c" = 200 ] && curl -sL -o "dl/vimeo_$(echo "$v"|md5sum|cut -c1-8).mp4" "$WB/web/2021id_/$v"
done
command -v yt-dlp >/dev/null || pip install -q yt-dlp
yt-dlp -o 'dl/vimeo_ytdlp.%(ext)s' https://vimeo.com/538348248 2>&1 | tail -2 | tee -a logs/run.log

log "== 3. Sites officiels 2021"
for u in "blueprincegame.com*" "dogubomb.com*"; do cdx "$u" | tee -a logs/cdx_sites.txt; done

log "== 5. Réuploads YouTube (vérifier date d'upload <= 2022)"
for q in "Blue Prince trailer 2021" "Blue Prince announcement Dogubomb" "Blue Prince Bequest trailer"; do
  yt-dlp --flat-playlist --print '%(upload_date)s %(duration)s %(id)s %(title)s' "ytsearch20:$q" 2>/dev/null | tee -a logs/youtube.txt
done

log "== Vérification des fichiers"
for f in dl/*; do [ -s "$f" ] || continue
  ffprobe -v error -show_entries format=duration:format_tags=creation_time -of default=nw=1 "$f" | tee -a logs/run.log
  b=$(basename "$f"); ffmpeg -v error -i "$f" -vf "fps=1/5,scale=640:-1" "frames/${b%.*}_%03d.jpg"
done
log "Fini. Voir dl/, frames/ et logs/."
