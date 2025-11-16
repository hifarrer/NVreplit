# Scene Generation URL Fix - Summary

## Problem
Some video scenes were failing to generate with the Wavespeed API because they were receiving relative image paths like `/objects/characters/character_abOwrBzC2WX3hDlQ0gzUh.jpeg` instead of proper Google Cloud Storage signed URLs.

### Example of Failing Request
```json
{
  "images": [
    "/objects/characters/character_abOwrBzC2WX3hDlQ0gzUh.jpeg"
  ],
  "prompt": "Character in a simple, clean environment...",
  "aspect_ratio": "16:9"
}
```

### Example of Working Request
```json
{
  "images": [
    "https://storage.googleapis.com/replit-objstore-e575b29a-5b91-4cc8-9e7c-23ea3b54fe73/.private/characters/character_abOwrBzC2WX3hDlQ0gzUh.jpeg?X-Goog-Algorithm=GOOG4-RSA-SHA256&..."
  ],
  "prompt": "Closeup of the character's face...",
  "aspect_ratio": "16:9"
}
```

## Root Cause
**The primary bug was in the retry/fallback logic for sensitive content.**

When a scene failed with "Content flagged as potentially sensitive" error:
1. The system would retry with a safer, generic prompt ✅
2. **BUT** the retry request used `characterImageUrl` (original input) instead of `publicCharacterImageUrl` (validated signed URL) ❌
3. This meant retry requests were sending relative paths like `/objects/characters/...` to Wavespeed
4. Wavespeed API would fail because it couldn't access the relative path

Additionally, the code lacked:
1. **Robust error handling** - Conversion failures were silently ignored
2. **Validation** - No checks to ensure the final URL was valid before sending to Wavespeed
3. **Comprehensive logging** - Difficult to debug when conversions failed

## Solution Implemented

### 1. Created Centralized Helper Function (`ensurePublicImageUrl`)
**Location:** `server/services/fal.ts` (lines 5-62)

This function:
- ✅ Automatically detects URL type (HTTP/HTTPS vs internal path)
- ✅ Converts internal paths to Google Cloud Storage signed URLs
- ✅ Validates the final URL format
- ✅ Provides detailed error messages and logging
- ✅ Handles all edge cases consistently

```typescript
async function ensurePublicImageUrl(characterImageUrl: string, ttlSec: number = 86400): Promise<string>
```

### 2. Enhanced Object Storage Service
**Location:** `server/objectStorage.ts` (lines 333-369)

Added comprehensive logging to `getSignedUrlForPath`:
- Logs input path
- Logs private directory
- Logs bucket and object names
- Logs success/failure with details
- Wraps entire conversion in try-catch

### 3. Updated Scene Generation Functions

#### `generateSingleSceneImage` (server/services/fal.ts)
- Now uses `ensurePublicImageUrl()` helper
- Cleaner, more maintainable code
- Guaranteed to use signed URLs

#### `generateSceneImages` (server/services/fal.ts)
- Now uses `ensurePublicImageUrl()` helper
- Consistent URL handling across all scenes
- Better error messages

## What Changed

### Before
```typescript
// Scattered, repetitive code with limited error handling
let publicCharacterImageUrl = characterImageUrl;
if (characterImageUrl.startsWith("/objects/")) {
  const { ObjectStorageService } = await import("../objectStorage");
  const objectStorageService = new ObjectStorageService();
  publicCharacterImageUrl = await objectStorageService.getSignedUrlForPath(
    characterImageUrl,
    86400,
  );
}
// No validation!
```

### After
```typescript
// Clean, validated, with comprehensive error handling
const publicCharacterImageUrl = await ensurePublicImageUrl(characterImageUrl, 86400);
// Guaranteed to be a valid HTTP/HTTPS URL or throws detailed error
```

## Benefits

1. **Prevents Invalid URLs**: Now impossible for relative paths to reach Wavespeed API
2. **Better Error Messages**: Clear, actionable error messages when conversion fails
3. **Comprehensive Logging**: Full visibility into URL conversion process
4. **Maintainability**: Centralized logic is easier to update and test
5. **Consistency**: Same validation applied everywhere

## Validation Steps

The fix includes multiple validation layers:

1. **Input Detection**: Identifies URL type (HTTP/HTTPS vs internal path)
2. **Conversion**: Generates signed URL for internal paths
3. **Output Validation**: Ensures result is valid HTTP/HTTPS URL
4. **Error Handling**: Catches and reports any conversion failures

## Logging Examples

You'll now see detailed logs like:

```
[ensurePublicImageUrl] Input URL: /objects/characters/character_xyz.jpeg
[ensurePublicImageUrl] Detected internal path, converting to signed URL...
[ObjectStorage] getSignedUrlForPath called with: /objects/characters/character_xyz.jpeg
[ObjectStorage] Private dir: /replit-objstore-xxx/.private
[ObjectStorage] Full object path: /replit-objstore-xxx/.private/characters/character_xyz.jpeg
[ObjectStorage] Bucket: replit-objstore-xxx, Object: .private/characters/character_xyz.jpeg
[ObjectStorage] Successfully generated signed URL (https://storage.googleapis.com/...)
[ensurePublicImageUrl] Successfully converted to signed URL
✓ Using validated character image URL for Wavespeed API
```

## Files Modified

1. `server/services/fal.ts`
   - Added `ensurePublicImageUrl()` helper function
   - Updated `generateSingleSceneImage()`
   - Updated `generateSceneImages()`
   - **CRITICAL FIX**: Updated retry logic (line 703) to use `publicCharacterImageUrl` instead of `characterImageUrl`

2. `server/objectStorage.ts`
   - Enhanced `getSignedUrlForPath()` with comprehensive logging
   - Added detailed error messages

## The Critical Fix

**Line 703 in server/services/fal.ts:**

```typescript
// BEFORE (BUG):
images: [characterImageUrl],  // ❌ Uses original input, could be /objects/...

// AFTER (FIXED):
images: [publicCharacterImageUrl],  // ✅ Uses validated signed URL
```

This one-line change ensures that retry requests for sensitive content also use properly signed URLs.

## Testing Recommendations

To verify the fix works:

1. Try generating scenes with a character image
2. Check logs for "[ensurePublicImageUrl]" entries
3. Verify all Wavespeed API requests show full HTTPS URLs
4. Confirm no scenes fail with "Request failed" errors

## Future Considerations

This fix ensures:
- All current scene generation uses signed URLs
- Future code will benefit from centralized validation
- Easier to debug URL-related issues
- Consistent behavior across the application
