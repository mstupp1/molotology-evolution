#!/usr/bin/env bash
# Builds a seamless loop of the main menu music.
# The last N seconds are equal-power crossfaded into the first N seconds and
# placed at the start of the file, so the end of the file flows straight back
# into its beginning with no click or gap.
# Usage: scripts/make-menu-loop.sh <source audio> [crossfade seconds]
set -euo pipefail
IN="$1"
N="${2:-6}"
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/public/assets"
T=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$IN")
B=$(echo "$T - $N" | bc -l)

ffmpeg -hide_banner -loglevel error -y -i "$IN" -filter_complex "
[0:a]asplit=3[a1][a2][a3];
[a1]atrim=start=$B:end=$T,asetpts=PTS-STARTPTS,afade=t=out:st=0:d=$N:curve=qsin[tail];
[a2]atrim=start=0:end=$N,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=$N:curve=qsin[head];
[tail][head]amix=inputs=2:normalize=0:duration=longest[blend];
[a3]atrim=start=$N:end=$B,asetpts=PTS-STARTPTS[body];
[blend][body]concat=n=2:v=0:a=1[out]" -map "[out]" -c:a vorbis -strict -2 -ac 2 -b:a 192k "$OUT_DIR/main-menu.ogg"

ffmpeg -hide_banner -loglevel error -y -i "$OUT_DIR/main-menu.ogg" -c:a aac -b:a 160k "$OUT_DIR/main-menu.m4a"
ls -la "$OUT_DIR"/main-menu.*
