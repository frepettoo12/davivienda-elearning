#!/bin/bash
# ============================================
# COMPOSE AVATAR SPLIT
# Combina video de avatar (izq) + contenido (der)
# ============================================

# Uso: ./compose_avatar_split.sh <avatar.mp4> <content.png> <output.mp4>

AVATAR_VIDEO=$1
CONTENT_IMAGE=$2
OUTPUT_VIDEO=$3

if [ -z "$AVATAR_VIDEO" ] || [ -z "$CONTENT_IMAGE" ] || [ -z "$OUTPUT_VIDEO" ]; then
    echo "Uso: $0 <avatar.mp4> <content.png> <output.mp4>"
    echo ""
    echo "Ejemplo:"
    echo "  $0 avatar.mp4 slide_content.png video_final.mp4"
    exit 1
fi

# Dimensiones finales
FINAL_W=1920
FINAL_H=1080

# Avatar ocupa 35% (672px) de ancho
AVATAR_W=672
AVATAR_H=1080

# Contenido ocupa 65% (1248px) - pero usamos 1920 y recortamos
CONTENT_W=1248
CONTENT_X=672

echo "Componiendo video split..."
echo "  Avatar: $AVATAR_VIDEO -> ${AVATAR_W}x${AVATAR_H}"
echo "  Contenido: $CONTENT_IMAGE"
echo "  Output: $OUTPUT_VIDEO"

# FFmpeg comando:
# 1. Escala avatar a 672x1080 (crop si es necesario)
# 2. Escala contenido a 1920x1080
# 3. Superpone avatar a la izquierda del contenido
ffmpeg -y \
    -i "$AVATAR_VIDEO" \
    -i "$CONTENT_IMAGE" \
    -filter_complex "
        [0:v]scale=${AVATAR_W}:${AVATAR_H}:force_original_aspect_ratio=increase,crop=${AVATAR_W}:${AVATAR_H}[avatar];
        [1:v]scale=${FINAL_W}:${FINAL_H}[bg];
        [bg][avatar]overlay=0:0[out]
    " \
    -map "[out]" \
    -map 0:a \
    -c:v libx264 -preset medium -crf 23 \
    -c:a aac -b:a 192k \
    -pix_fmt yuv420p \
    "$OUTPUT_VIDEO"

echo ""
echo "Listo: $OUTPUT_VIDEO"
