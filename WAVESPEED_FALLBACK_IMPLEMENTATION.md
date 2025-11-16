# Wavespeed Model Fallback Implementation

## Overview
Implemented a robust fallback system for scene generation that automatically switches from the primary model to a fallback model when generation fails.

## Models

### Primary Model
- **Name**: `google/nano-banana/edit`
- **Endpoint**: `https://api.wavespeed.ai/api/v3/google/nano-banana/edit`
- **Parameters**:
  ```json
  {
    "enable_base64_output": false,
    "enable_sync_mode": false,
    "images": ["<signed-url>"],
    "output_format": "jpeg",
    "prompt": "<prompt>",
    "aspect_ratio": "16:9"
  }
  ```

### Fallback Model
- **Name**: `alibaba/wan-2.5/image-edit`
- **Endpoint**: `https://api.wavespeed.ai/api/v3/alibaba/wan-2.5/image-edit`
- **Parameters**:
  ```json
  {
    "images": ["<signed-url>"],
    "prompt": "<prompt>",
    "seed": -1
  }
  ```

## Architecture

### 1. Model Configuration (Lines 68-99)

```typescript
type WavespeedModel = {
  name: string;
  endpoint: string;
  buildRequestBody: (imageUrl: string, prompt: string) => any;
};

const WAVESPEED_MODELS = {
  primary: { /* google/nano-banana/edit config */ },
  fallback: { /* alibaba/wan-2.5/image-edit config */ }
};
```

**Benefits:**
- Centralized model definitions
- Easy to add new models
- Parameter differences abstracted away

### 2. Core Helper Functions

#### `submitAndPollSceneGeneration()` (Lines 105-209)
Handles the submission and polling logic for any Wavespeed model.

**Features:**
- Model-agnostic implementation
- Comprehensive logging with model name
- Error handling with detailed messages
- Polls every 3 seconds for up to 15 minutes

#### `generateSceneWithFallback()` (Lines 214-259)
Implements the automatic fallback logic.

**Flow:**
1. Try primary model (google/nano-banana/edit)
2. If fails → Try fallback model (alibaba/wan-2.5/image-edit)
3. If both fail → Throw detailed error with both failure reasons

**Returns:** `{ imageUrl: string, modelUsed: string }`
- Tracks which model successfully generated the scene
- Useful for analytics and debugging

### 3. Updated Public Functions

#### `generateSingleSceneImage()` (Lines 553-573)
Simplified from ~120 lines to ~20 lines.

**Before:** Direct API calls with manual error handling
**After:** Uses `generateSceneWithFallback()` helper

**Benefits:**
- Automatic fallback support
- Cleaner code
- Easier to maintain

#### `generateSceneImages()` (Lines 575-642)
Simplified from ~350 lines to ~70 lines.

**Before:** Complex retry logic with manual prompt fallback
**After:** Parallel calls to `generateSceneWithFallback()`

**Benefits:**
- Each scene independently tries both models
- Automatic fallback per scene
- Cleaner error reporting
- 80% less code

## Fallback Behavior

### When Fallback Triggers
The system automatically falls back to alibaba model when the google model fails for **any reason**:
- ✅ Sensitive content flagging
- ✅ API errors (500, 503, etc.)
- ✅ Timeouts
- ✅ Invalid responses
- ✅ Network issues

### Logging

Each step is logged with model-specific tags:

```
[google/nano-banana/edit] Submitting scene 1 generation...
[google/nano-banana/edit] Scene 1 generation failed: Content flagged
[Fallback] Primary model failed, attempting fallback...
[alibaba/wan-2.5/image-edit] Submitting scene 1 generation...
[alibaba/wan-2.5/image-edit] Scene 1 generation completed!
[Fallback] Successfully generated scene 1 using alibaba/wan-2.5/image-edit
✓ Scene 1 generated successfully using alibaba/wan-2.5/image-edit
```

### Error Messages

If both models fail, you get a detailed error:

```
Both models failed for scene 1.
Primary (google/nano-banana/edit): Content flagged as potentially sensitive
Fallback (alibaba/wan-2.5/image-edit): Scene generation timed out after 180 attempts
```

## Integration with Existing Fix

This fallback system works seamlessly with the signed URL fix:

1. **URL Validation** → `ensurePublicImageUrl()` ensures signed URLs
2. **Scene Generation** → `generateSceneWithFallback()` tries both models
3. **Result** → Returns successful scene or detailed error

## Code Reduction

| Function | Before | After | Reduction |
|----------|--------|-------|-----------|
| `generateSingleSceneImage` | ~120 lines | ~20 lines | 83% |
| `generateSceneImages` | ~350 lines | ~70 lines | 80% |
| **Total** | **~470 lines** | **~90 lines** | **81%** |

Plus ~200 lines of reusable helper functions = **Net reduction: ~180 lines (38%)**

## Benefits

### 1. Reliability
- Automatic fallback increases success rate
- No manual intervention needed
- Gracefully handles all failure types

### 2. Maintainability
- Centralized model configuration
- DRY principle (Don't Repeat Yourself)
- Easy to add new models

### 3. Observability
- Tracks which model was used
- Detailed error messages
- Comprehensive logging

### 4. Performance
- Parallel scene generation maintained
- No additional latency on success
- Only adds time on failure (which is better than complete failure)

## Testing the Fallback

To test the fallback system:

1. **Generate scenes** with potentially sensitive content
2. **Check logs** for fallback activation:
   ```
   [Fallback] Primary model failed
   [Fallback] Attempting fallback to alibaba/wan-2.5/image-edit...
   ```
3. **Verify success** using fallback model
4. **Check return value** shows correct model name

## Files Modified

1. **server/services/fal.ts**
   - Added `WavespeedModel` type
   - Added `WAVESPEED_MODELS` configuration
   - Added `submitAndPollSceneGeneration()` helper
   - Added `generateSceneWithFallback()` helper
   - Simplified `generateSingleSceneImage()` (83% reduction)
   - Simplified `generateSceneImages()` (80% reduction)

## Future Enhancements

Potential improvements:
- Add more fallback models (3-tier system)
- Implement model selection based on prompt type
- Add model performance metrics/analytics
- Implement smart model selection based on historical success rates
- Add cost optimization (use cheaper models first)

## Summary

This implementation provides a robust, maintainable, and efficient fallback system that:
- ✅ Automatically handles failures
- ✅ Reduces code complexity by 81%
- ✅ Provides comprehensive logging
- ✅ Tracks model usage
- ✅ Works seamlessly with signed URL validation
- ✅ Increases overall reliability of scene generation
