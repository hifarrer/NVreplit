# NeonVideo.ai API Examples

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "headline": "NeonVideo.ai API Examples",
  "description": "Curl examples for NeonVideo.ai video generation, captioning, upscaling, AI video editing, and background removal.",
  "url": "https://neonvideo.ai/examples.md",
  "about": {
    "@type": "SoftwareApplication",
    "name": "NeonVideo.ai",
    "applicationCategory": "MultimediaApplication",
    "url": "https://neonvideo.ai/"
  }
}
</script>

Set variables:

```bash
export BASE_URL="https://neonvideo.ai"
export API_TOKEN="YOUR_API_TOKEN"
```

## Create a prompt-only video

```bash
curl -X POST "$BASE_URL/api/v1/videos" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A 3D animated astronaut cat DJ performing a dance track on the moon",
    "aspect_ratio": "9:16",
    "video_duration": 30,
    "captions": false
  }'
```

## Create a video from custom audio

```bash
curl -X POST "$BASE_URL/api/v1/videos" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A cinematic desert road trip music video with warm sunset lighting",
    "audio_url": "https://example.com/song.mp3",
    "aspect_ratio": "16:9",
    "video_duration": 60,
    "captions": true
  }'
```

## Create a video from custom audio and reference image

```bash
curl -X POST "$BASE_URL/api/v1/videos" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Use the reference character as the singer in a neon club performance",
    "audio_url": "https://example.com/song.mp3",
    "image_url": "https://example.com/character.png",
    "aspect_ratio": "9:16",
    "video_duration": 45,
    "captions": false
  }'
```

## Poll for completion

```bash
VIDEO_ID="VIDEO_ID_FROM_CREATE_RESPONSE"

curl "$BASE_URL/api/v1/videos/$VIDEO_ID/status" \
  -H "Authorization: Bearer $API_TOKEN"
```

## Bash loop for create and poll

```bash
RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/videos" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "An animated fox singer on a glowing forest stage",
    "aspect_ratio": "9:16",
    "video_duration": 30
  }')

VIDEO_ID=$(echo "$RESPONSE" | jq -r '.video_id')

while true; do
  STATUS_RESPONSE=$(curl -s "$BASE_URL/api/v1/videos/$VIDEO_ID/status" \
    -H "Authorization: Bearer $API_TOKEN")

  STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.status')
  echo "$STATUS_RESPONSE"

  if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ]; then
    break
  fi

  sleep 10
done
```

## Add captions to a video

```bash
curl -X POST "$BASE_URL/api/v1/tools/add-captions" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "video_url": "https://example.com/video.mp4",
    "caption_style": "yellow-bg",
    "position": "bottom"
  }'
```

## Upscale a video

```bash
curl -X POST "$BASE_URL/api/v1/tools/video-upscaler" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "video_url": "https://example.com/video.mp4",
    "target_resolution": "1080p",
    "duration_seconds": 30
  }'
```

## Edit a video with a prompt

```bash
curl -X POST "$BASE_URL/api/v1/tools/ai-video-edition" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "video_url": "https://example.com/video.mp4",
    "prompt": "Replace the cloudy sky with a vivid sunset",
    "duration_seconds": 30
  }'
```

## Remove a video background

```bash
curl -X POST "$BASE_URL/api/v1/tools/video-background-remover" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "video_url": "https://example.com/video.mp4",
    "duration_seconds": 30
  }'
```

## Useful style values

Caption styles:

```text
plain-white
yellow-bg
pink-bg
blue-bg
red-bg
```

Character/art styles:

```text
Realistic Cinematic
Realistic Natural
3D Animated
3D Toon
Anime Clean Cel
Anime Realistic
Black and White
Cartoon
Clay
Comic
Cyberpunk
Digital Painting
Fantasy
Futuristic
Goth
Toy Blocks
Manga
Miniature Toy
Oil Painting
Pixelated
Psychodelic
Punk
Retro
Sketch
Steampunk
Watercolor
Ultra Surreal
1960
1970
1980
```
