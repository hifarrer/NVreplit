# Standalone Character Creator — Porting Guide

This document describes the **current NeonVideo “Character Creator”** implementation so you (or an AI agent) can reproduce it in a **separate web project**. It covers UI source files, HTTP APIs, CDN thumbnail assets, WaveSpeed integration details, auth, validation, and styling hooks.

---

## 1. What “character creator” means in this repo

- **Full-page tool**: `CreateCharacterCreatorPage` at route **`/create/character-creator`** (protected; requires logged-in user).
- **Core UI**: `StandaloneCharacterCreator` — tabs **Generate** and **Upload**, style picker with thumbnails, optional aspect ratio on the page variant, save-to-library, camera-angle refinement, image expand/download.

**Primary source files**

| Role | Path |
|------|------|
| Page shell (header, back link, footer) | `client/src/pages/create-character-creator.tsx` |
| Main UI + client logic | `client/src/components/standalone-character-creator.tsx` |
| Camera angle modal | `client/src/components/modals/character-camera-angle-modal.tsx` |
| Save modal (optional; see note below) | `client/src/components/modals/save-character-modal.tsx` |
| App route registration | `client/src/App.tsx` (route `/create/character-creator`) |
| Style catalog (server + static JSON) | `characters.json` (repo root) + `GET /api/characters/styles` |
| Generation + i2i implementation | `server/services/fal.ts` (`generateCharacterImages`, `generateCharacterImageToImage`, polling) |
| HTTP routes | `server/routes.ts` |
| Auth header helper | `client/src/lib/queryClient.ts` (`apiRequest`, React Query default `queryFn`) |
| Saved character DB shape | `shared/schema.ts` → `savedCharacters` |

**Note:** `SaveCharacterModal` is mounted in `StandaloneCharacterCreator`, but **`showSaveModal` is never set to `true`** in that component. Saving uses **`POST /api/characters`** directly from mutation handlers (“Save to Library” on generated/uploaded images). For a standalone app, you can omit the modal or wire a “Save as…” flow to it.

---

## 2. Authentication

Most character-creator calls require a JWT:

- **Storage key**: `localStorage.getItem('auth_token')`
- **Header**: `Authorization: Bearer <token>`
- **Fetch**: `credentials: "include"` (session cookies may also apply depending on deployment)

`apiRequest` in `client/src/lib/queryClient.ts` attaches the Bearer token automatically.

| Endpoint | Auth |
|----------|------|
| `GET /api/characters/styles` | **None** (public) |
| `GET /api/characters/limit` | **Required** (`authenticateToken`) |
| `POST /api/characters/generate-options` | **Required** |
| `POST /api/characters/generate-image-to-image` | **Required** |
| `POST /api/characters/upload` | **Required** |
| `POST /api/characters` (save) | **Required** |
| `POST /api/change-camera-angle` | **Required** |

---

## 3. HTTP API reference (standalone character flows)

Base URL is your deployed API origin (e.g. same host as the SPA in production, or `http://localhost:5000` in dev — match your Vite proxy if any).

### 3.1 `GET /api/characters/styles`

Returns an array of style objects. The server **prepends** a synthetic **“No style”** row; the rest comes from `characters.json`.

**Response item shape**

```ts
type CharacterStyle = {
  style_name: string;
  model: string;              // WaveSpeed model path segment, e.g. "alibaba/wan-2.5/text-to-image"
  thumbnail_image: string;    // Full HTTPS URL (Bunny CDN)
  prompt_enhancer: string | null;
};
```

**“No style” defaults** (hardcoded in `server/routes.ts`)

- `style_name`: `"No style"`
- `model`: `"alibaba/wan-2.5/text-to-image"`
- `thumbnail_image`: `https://neonvideo.b-cdn.net/characterpublic/no_style.jpg`
- `prompt_enhancer`: `null`

---

### 3.2 `GET /api/characters/limit`

**Response** (used for free-plan cap UI)

```ts
type CharacterLimitInfo = {
  count: number;
  limit: number | null;   // e.g. 30 for free tier logic
  isFreePlan: boolean;
  isAtLimit: boolean;
  canCreate: boolean;
};
```

---

### 3.3 `POST /api/characters/generate-options`

**Body (JSON)**

```json
{
  "prompt": "string (>10 chars recommended in UI)",
  "aspectRatio": "1:1 | 16:9 | 9:16 | 4:3 | 3:4",
  "style": "<CharacterStyle.style_name>",
  "model": "<CharacterStyle.model>",
  "promptEnhancer": "<string | null>"
}
```

**Client behavior** (`standalone-character-creator.tsx`)

- When `asPage === true`, sends the selected **aspect ratio** from the page.
- When used as a modal (`asPage === false`), sends **`aspectRatio: "16:9"`** for generate.
- Timeout: **900000 ms** (15 minutes) on the client.

**Server**

- Calls `validateCharacterGenerationPrompt(prompt, promptEnhancer)` (`server/profanity-filter.ts`).
- Calls `generateCharacterImages(prompt, aspectRatio, style, model, promptEnhancer)` → WaveSpeed (see §5).

**Success response**

```json
{
  "imageUrls": ["https://..."],
  "prompt": "..."
}
```

**Important:** With the current `generateCharacterImages` implementation, when `model` is provided, **only one image URL** is returned (`imageUrls` length 1). The UI still renders a grid as if there could be multiple.

---

### 3.4 `POST /api/characters/generate-image-to-image`

Used on the **Upload** tab to apply a style to an uploaded image (“Change Style”).

**Body (JSON)**

```json
{
  "imageUrl": "<URL from upload or CDN>",
  "prompt": "string (non-empty; client may send \"character\")",
  "promptEnhancer": "<from selected upload style>",
  "aspectRatio": "1:1 | 16:9 | 9:16 | 4:3 | 3:4"
}
```

**Client**

- Modal mode: `aspectRatio` defaults to **`"1:1"`** on the server if omitted; page mode uses selected aspect ratio.
- Timeout: **900000 ms**.

**Server**

- Validates prompts via `validateCharacterGenerationPrompt`.
- Calls `generateCharacterImageToImage(imageUrl, prompt, promptEnhancer, aspectRatio)` → **WaveSpeed** `bytedance/seedream-v4.5/edit` (see §5).

**Success response**

```json
{
  "imageUrl": "https://...",
  "prompt": "..."
}
```

---

### 3.5 `POST /api/characters/upload`

**Content-Type**: `multipart/form-data`  
**Field name**: **`image`** (single file)

**Constraints** (enforced client + server)

- Types: `image/jpeg`, `image/jpg`, `image/png`, `image/gif`
- Max size: **5 MB**

**Server processing**

- Resize with **sharp** to **1024×1024** cover JPEG (quality 90); on sharp failure, uses original buffer.
- Upload target (first match): Bunny Storage (“characters”) → ImageKit `/characters` → GCS private object path.
- **Content moderation** (`moderateImageContent`) may reject with `400` or `503`.

**Success response**

```json
{
  "imageUrl": "/objects/characters/character_<nanoid>.jpg"
}
```

or a public Bunny/ImageKit HTTPS URL depending on configuration.

---

### 3.6 `POST /api/characters` (save to library)

**Body (JSON)** — persisted fields after validation are essentially:

```json
{
  "name": "string",
  "prompt": "string",
  "imageUrl": "string"
}
```

The client sometimes sends **`style`**; the DB schema **`saved_characters`** has no `style` column, so Zod/Drizzle insert schema **does not persist** it (extra keys are ignored/stripped).

**Free plan**: If user is on free plan and already has **≥ 30** saved characters, returns **403** with:

```json
{
  "error": "Character limit reached",
  "message": "Free users can save up to 30 characters...",
  "isLimitError": true
}
```

If `imageUrl` is external (not `/objects/...` or Bunny URL pattern), server **downloads and re-uploads** to `"saved-characters"` storage.

**Success**: `201` + saved character row (id, userId, name, prompt, imageUrl, createdAt).

---

### 3.7 `POST /api/change-camera-angle` (camera angle modal)

**Body (JSON)**

```json
{
  "imageUrl": "<https URL or /objects/... path>",
  "horizontalAngle": 0,
  "verticalAngle": 0,
  "distance": 1
}
```

**Client** (`character-camera-angle-modal.tsx`): sliders **horizontal 0–359**, **vertical −30–60**, **distance 0–2** (step 0.1). Timeout **300000 ms**.

**Server mapping**

- `horizontalForApi`: if `horizontalAngle < 0`, add 360 (UI already uses 0–359).
- `verticalForApi`: maps UI vertical range to **0–60** for the API:  
  `min(60, max(0, round(((verticalAngle + 90) / 180) * 60)))`  
  (So the modal’s −30..60 becomes a subset of the API’s 0..60.)

- If `imageUrl` starts with `/objects/`, server prefixes absolute base from `REPLIT_DEV_DOMAIN`, `REPLIT_DOMAINS`, or `http://localhost:5000`.

**WaveSpeed**

- Submit: `POST https://api.wavespeed.ai/api/v3/wavespeed-ai/qwen-image/edit-multiple-angles`
- Poll: `GET https://api.wavespeed.ai/api/v3/predictions/{requestId}/result` every **5 s**, up to **60** attempts.

**Success response**

```json
{ "imageUrl": "https://..." }
```

---

## 4. Style thumbnail and model catalog (static assets)

All thumbnails below are served from Bunny CDN:

**Base**: `https://neonvideo.b-cdn.net/characterpublic/`

| style_name | model | thumbnail filename |
|------------|--------|---------------------|
| No style | `alibaba/wan-2.5/text-to-image` | `no_style.jpg` (injected by API, not in JSON) |
| Realistic Cinematic | `wavespeed-ai/qwen-image/text-to-image-2512-lora` | `realistic1.jpg` |
| Realistic Natural | `wavespeed-ai/z-image/turbo` | `realistic2.jpg` |
| 3D Animated | `alibaba/wan-2.5/text-to-image` | `3danimted_film.jpg` |
| 3D Toon | `alibaba/wan-2.5/text-to-image` | `3dtoon.jpg` |
| Anime Clean Cel | `alibaba/wan-2.5/text-to-image` | `anime_cleancel.jpg` |
| Anime Realistic | `alibaba/wan-2.5/text-to-image` | `anime_realistic.jpg` |
| Black and White | `alibaba/wan-2.5/text-to-image` | `bnw.jpg` |
| Cartoon | `alibaba/wan-2.5/text-to-image` | `cartoon.jpg` |
| Clay | `alibaba/wan-2.5/text-to-image` | `clay.jpg` |
| Comic | `alibaba/wan-2.5/text-to-image` | `comic.jpg` |
| Cyberpunk | `alibaba/wan-2.5/text-to-image` | `cyberpunk.jpg` |
| Digital Painting | `alibaba/wan-2.5/text-to-image` | `digitalpainting.jpg` |
| Fantasy | `alibaba/wan-2.5/text-to-image` | `fantasy.jpg` |
| Futuristic | `alibaba/wan-2.5/text-to-image` | `futuristic.jpg` |
| Goth | `alibaba/wan-2.5/text-to-image` | `goth.jpg` |
| Toy Blocks | `bytedance/seedream-v4` | `lego.jpg` |
| Manga | `alibaba/wan-2.5/text-to-image` | `manga.jpg` |
| Miniature Toy | `z-ai/cogview-4` | `miniature_toy.jpg` |
| Oil Painting | `alibaba/wan-2.5/text-to-image` | `oil_painting.jpg` |
| Pixelated | `alibaba/wan-2.5/text-to-image` | `pixelated.jpg` |
| Psychodelic | `alibaba/wan-2.5/text-to-image` | `psychodelic.jpg` |
| Punk | `alibaba/wan-2.5/text-to-image` | `punk.jpg` |
| Retro | `alibaba/wan-2.5/text-to-image` | `retro.jpg` |
| Sketch | `alibaba/wan-2.5/text-to-image` | `sketch.jpg` |
| Steampunk | `alibaba/wan-2.5/text-to-image` | `steampunk.jpg` |
| Watercolor | `alibaba/wan-2.5/text-to-image` | `watercolor.jpg` |
| Ultra Surreal | `alibaba/wan-2.5/text-to-image` | `Ultra_Surreal.jpg` |
| 1960 | `bytedance/seedream-v4` | `1960.jpg` |
| 1970 | `bytedance/seedream-v4` | `1970.jpg` |
| 1980 | `bytedance/seedream-v4` | `1980.jpg` |

Full URL = `https://neonvideo.b-cdn.net/characterpublic/<filename>`.

**Fallback image** (broken thumbnail in UI): `https://via.placeholder.com/150?text=No+Image`

---

## 5. WaveSpeed.ai (third-party) — replicate without this backend

**Env**: `WAVESPEED_API_KEY` — Bearer token for all calls.

### 5.1 Text-to-image (character generate)

- **URL**: `POST https://api.wavespeed.ai/api/v3/{model}`
- **Common body** (see `generateCharacterImageWithModel` in `server/services/fal.ts`):

```json
{
  "enable_base64_output": false,
  "enable_sync_mode": false,
  "prompt": "front shot of a <user prompt>[, <prompt_enhancer if present>]",
  "size": "<WxH string from mapping below>"
}
```

**Model-specific additions**

- `z-ai/cogview-4`: `"quality": "hd"`
- `wavespeed-ai/qwen-image/text-to-image-2512-lora`: `"loras": []`, `"output_format": "jpeg"`, `"seed": -1`
- `alibaba/wan-2.5/text-to-image`: `"enable_prompt_expansion": false`, `"seed": -1`
- `bytedance/seedream-v4`, `wavespeed-ai/z-image/turbo`: defaults only

**Success**: JSON with `code === 200` and `data.id` = request id.

**Poll**: `GET https://api.wavespeed.ai/api/v3/predictions/{id}/result` with `Authorization: Bearer …` every **5 s**. Completed when `data.status === "completed"`; image at `data.outputs[0]`.

**Aspect → size** (`aspectRatioToSize` in `fal.ts`)

| aspectRatio | size |
|-------------|------|
| 1:1 | 1024*1024 |
| 16:9 | 1280*720 |
| 9:16 | 720*1280 |
| 4:3 | 1152*864 |
| 3:4 | 864*1152 |

### 5.2 Image-to-image (upload “Change Style”)

- **URL**: `POST https://api.wavespeed.ai/api/v3/bytedance/seedream-v4.5/edit`
- **Input image**: must be a **public HTTP(S) URL**; this codebase uses `ensurePublicImageUrl` to rewrite `/objects/...` etc.

**Body**

```json
{
  "enable_base64_output": false,
  "enable_sync_mode": false,
  "images": ["<public image URL>"],
  "prompt": "front shot of a <user prompt>[, <prompt_enhancer>]",
  "size": "<from seedream i2i mapping>"
}
```

**Aspect → size** (`seedreamImageToImageSizeForAspectRatio`)

| aspectRatio | size |
|-------------|------|
| 1:1 | 2048*2048 |
| 16:9 | 2560*1440 |
| 9:16 | 1440*2560 |
| 4:3 | 2304*1728 |
| 3:4 | 1728*2304 |

Poll same **`/predictions/{id}/result`** pattern as above.

### 5.3 Camera angle

- **Submit**: `POST https://api.wavespeed.ai/api/v3/wavespeed-ai/qwen-image/edit-multiple-angles`

```json
{
  "distance": 1,
  "enable_base64_output": false,
  "enable_sync_mode": false,
  "horizontal_angle": 0,
  "images": ["<public URL>"],
  "output_format": "jpeg",
  "seed": -1,
  "vertical_angle": 0
}
```

- **Poll**: same predictions result endpoint, 5 s interval (server uses up to 60 attempts).

---

## 6. Content validation

`validateCharacterGenerationPrompt` in `server/profanity-filter.ts` runs on generate and image-to-image routes. A standalone backend should either **port this module** or replace it with your own moderation policy. Expect **500/400** style failures when prompts fail validation.

---

## 7. Frontend dependencies (to port the UI)

**npm packages** (from component imports)

- `react`, `@tanstack/react-query`, `wouter` (only if you keep `Link` to `/plans`), `lucide-react`, `clsx`/`tailwind-merge` pattern via `@/lib/utils` (`cn`)

**Internal UI** (shadcn-style under `client/src/components/ui/`)

- `button`, `label`, `textarea`, `tabs`, `alert`, `progress`, `dialog`, `select`, `slider`, `input`, `tooltip`

**Hooks**

- `@/hooks/use-toast` + `@/components/ui/toaster` (or replace with your toast system)

**Business rules mirrored in UI**

- Generate disabled until `prompt.trim().length > 10` and a style is selected.
- Upload tab: styles filtered to **exclude** `"No style"`.
- Download: `fetch(imageUrl, { mode: "cors" })` then blob download; may fail if CDN forbids CORS — UI shows an error toast.

---

## 8. Custom CSS classes (Neon-specific)

Defined in `client/src/index.css` under `@layer components`. For parity, copy at least:

- `.gradient-text` — title gradient (pink / cyan)
- `.floating-button` — primary CTA gradient + shadow
- `.loading-spinner` — small pink spinner
- `.upload-zone` — dashed drop area
- `.custom-scrollbar` — pink scrollbar styling

---

## 9. Related project-only endpoints (not used by standalone creator UI)

These exist for the **main video flow** (`CharacterCreationStep` + project id) but are **not** called by `StandaloneCharacterCreator`:

- `POST /api/projects/:id/generate-character-options`
- `POST /api/projects/:id/generate-character-image-to-image`
- `POST /api/projects/:id/save-character-option`
- `POST /api/characters/enhance-hyper-real` (hyper-real enhancement; not wired in standalone creator)

---

## 10. Checklist for a greenfield standalone app

1. **Public catalog**: Either call `GET /api/characters/styles` or ship a copy of `characters.json` + prepend “No style” as the server does.
2. **Auth**: Login that stores JWT in `localStorage` as `auth_token` (or change your client helper to match your auth).
3. **Implement or proxy**: generate-options, generate-image-to-image, upload, save, change-camera-angle (or call Neon’s API if allowed).
4. **WaveSpeed**: Single `WAVESPEED_API_KEY` and polling loop for async jobs.
5. **Storage**: For uploads, S3/R2/Bunny/GCS + signed or public URLs for downstream WaveSpeed image inputs.
6. **Optional**: Character library UI uses `GET /api/characters` — not required for core creator, only for “my saved characters” elsewhere.

---

*Generated from repository state: `StandaloneCharacterCreator`, `server/routes.ts`, `server/services/fal.ts`, `characters.json`, `shared/schema.ts`, `client/src/lib/queryClient.ts`.*
