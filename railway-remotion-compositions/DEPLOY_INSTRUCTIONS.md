# Deploying NeonVideo Compositions to Railway Remotion Service

## What needs to happen

Your Railway Remotion service at `https://remotion-template-staging.up.railway.app` currently
only has the `HelloWorld` composition. Your NeonVideo app needs two custom compositions:

- **CaptionedVideo** — TikTok-style karaoke captions overlaid on video
- **TextOverlay** — Static text lines overlaid on video at timed intervals

## Files to deploy

Copy the four files from this directory into your Railway Remotion project's `remotion/` folder,
**replacing** the existing `Root.tsx` and `index.ts`:

```
remotion/
├── index.ts                        ← REPLACE existing
├── Root.tsx                        ← REPLACE existing
├── CaptionedVideoComposition.tsx   ← NEW
└── TextOverlayComposition.tsx      ← NEW
```

You can safely remove any existing composition files that were part of the template
(e.g. `HelloWorld.tsx`, `QuizVideo.tsx`).

## Server-side requirements

The Railway service's render endpoint must:

1. Accept `compositionId` and `inputProps` in the POST body
2. Use `selectComposition` with the `compositionId` from the request
3. Override `width`, `height`, and `durationInFrames` from `inputProps` if present
4. Return `{ fileName }` and serve rendered file at `GET /download/:fileName`

If the service's `POST /render` handler currently hard-codes a composition ID, update it
to use `req.body.compositionId` instead:

```typescript
// In the render handler:
const { compositionId, inputProps } = req.body;

const composition = await selectComposition({
  serveUrl: bundleUrl,
  id: compositionId,
  inputProps,
});

// Override dimensions/duration from inputProps if provided
if (inputProps.width) composition.width = inputProps.width;
if (inputProps.height) composition.height = inputProps.height;
if (inputProps.durationInFrames) composition.durationInFrames = inputProps.durationInFrames;

await renderMedia({
  serveUrl: bundleUrl,
  composition,
  codec: "h264",
  inputProps,
  // ... other options
});
```

## Testing

After deploying, test with:

```bash
# Test CaptionedVideo composition exists
curl -X POST "https://remotion-template-staging.up.railway.app/render" \
  -H "Content-Type: application/json" \
  -d '{
    "compositionId": "CaptionedVideo",
    "inputProps": {
      "videoSrc": "https://example.com/test.mp4",
      "pages": [],
      "fps": 30,
      "stylePreset": "plain-white",
      "captionPosition": "bottom",
      "width": 1080,
      "height": 1440,
      "durationInFrames": 300
    }
  }'

# Test TextOverlay composition exists
curl -X POST "https://remotion-template-staging.up.railway.app/render" \
  -H "Content-Type: application/json" \
  -d '{
    "compositionId": "TextOverlay",
    "inputProps": {
      "videoSrc": "https://example.com/test.mp4",
      "textLines": [{"text": "Hello", "startTime": 0, "duration": 5}],
      "textPosition": "center",
      "fps": 30,
      "width": 1080,
      "height": 1440,
      "durationInFrames": 300
    }
  }'
```

Both should return `{ "message": "sent task for rendering", "fileName": "xxx.mp4" }`.

## Dependencies

The compositions only require `remotion` (which is already a dependency of the Railway template).
No additional packages are needed — `@remotion/captions` is NOT required since the caption
pages are pre-computed by the NeonVideo server before being sent as `inputProps`.
