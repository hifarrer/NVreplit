# NeonVideo AI - Single Prompt API Documentation

## Overview
The NeonVideo Single Prompt API allows you to generate complete music videos from a single text prompt. The system orchestrates multiple AI services to create a 30-second music video with custom character, song, lyrics, and scene animations.

## Endpoint

```
POST /api/neon-single-prompt
```

## Authentication
Requires JWT authentication token in the `auth_token` cookie or Authorization header.

```bash
# Cookie-based authentication
curl -X POST https://your-domain.replit.dev/api/neon-single-prompt \
  -H "Content-Type: application/json" \
  -H "Cookie: auth_token=YOUR_JWT_TOKEN" \
  -d '{"prompt": "your prompt here"}'

# Header-based authentication
curl -X POST https://your-domain.replit.dev/api/neon-single-prompt \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"prompt": "your prompt here"}'
```

## Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| prompt | string | Yes | A natural language description of the desired music video. Should include character, song title, and video setting/theme. |

### Request Example

```json
{
  "prompt": "Make a video featuring a neon-glowing robot dancer performing a song titled 'Electric Dreams' in a futuristic cyberpunk city."
}
```

## Response

### Success Response (200 OK)

```json
{
  "success": true,
  "projectId": "95053210-b226-40fd-9a7a-788ae59dc43f",
  "message": "Video generation started successfully"
}
```

### Error Responses

#### 400 Bad Request - Missing Prompt
```json
{
  "error": "Prompt is required"
}
```

#### 401 Unauthorized
```json
{
  "error": "Access token required"
}
```

#### 402 Payment Required - Insufficient Credits
```json
{
  "error": "Insufficient credits",
  "creditsRequired": 1000,
  "creditsRemaining": 500
}
```

#### 500 Internal Server Error
```json
{
  "error": "Failed to generate video",
  "details": "Error message here"
}
```

## Complete cURL Examples

### Basic Request
```bash
curl -X POST https://046b05f0-5ff8-4276-acdf-2f3159a5e709-00-3a4g2oro15uqc.kirk.replit.dev/api/neon-single-prompt \
  -H "Content-Type: application/json" \
  -H "Cookie: auth_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -d '{
    "prompt": "Create a music video with a cowboy hamster singing country music in the wild west desert."
  }'
```

### Request with Detailed Prompt
```bash
curl -X POST https://your-domain.replit.dev/api/neon-single-prompt \
  -H "Content-Type: application/json" \
  -H "Cookie: auth_token=YOUR_JWT_TOKEN" \
  -d '{
    "prompt": "Make a video featuring a cyberpunk cat DJ performing a song called \"Neon Nights\" in a futuristic Tokyo nightclub with strobing lights."
  }'
```

### Request with Authorization Header
```bash
curl -X POST https://your-domain.replit.dev/api/neon-single-prompt \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "prompt": "An astronaut panda performing \"Space Disco\" in a zero-gravity dance club orbiting Earth."
  }'
```

## Workflow Process

The endpoint executes the following steps automatically:

1. **Prompt Parsing (OpenAI)**: Extracts character description, song title, and video description from the prompt
2. **Project Creation**: Creates a new project in the database
3. **Lyrics Generation (OpenAI)**: Generates song lyrics based on the parsed information
4. **Song Generation (ElevenLabs)**: Creates a 30-second AI-generated song with the lyrics
5. **Character Image (Wavespeed AI)**: Generates a character image based on the description
6. **Scene Prompts (OpenAI)**: Creates 3 dynamic scene descriptions with camera movements
7. **Scene Images (Wavespeed AI)**: Generates 3 scene images in parallel
8. **Video Generation (Async)**: Triggers final video creation with audio splitting and merging

## Video Generation Status

After receiving the success response, poll the project status to check video generation progress:

```bash
curl -X GET https://your-domain.replit.dev/api/projects/{projectId} \
  -H "Cookie: auth_token=YOUR_JWT_TOKEN"
```

### Project Status Response
```json
{
  "id": "95053210-b226-40fd-9a7a-788ae59dc43f",
  "userId": "b3eb8062-4ed1-4be5-82ce-61e49491ec38",
  "title": "My Music Video",
  "currentStep": 5,
  "audioDuration": 30,
  "audioUrl": "/objects/songs/93443873-d923-4e2f-93c1-8a9c5f01d5ae.mp3",
  "characterImageUrl": "https://d1q70pf5vjeyhc.cloudfront.net/predictions/192e3d9376bd4a5494a96f6d4c677fbd/1.jpeg",
  "sceneImages": [
    "https://d1q70pf5vjeyhc.cloudfront.net/predictions/20f9e71a63ab4923a89f3957cde749d4/1.jpg",
    "https://d1q70pf5vjeyhc.cloudfront.net/predictions/95116197eeef4337b66292710dc1cf9e/1.jpg",
    "https://d1q70pf5vjeyhc.cloudfront.net/predictions/68fc133480e748c4a129c52e19f560b1/1.jpg"
  ],
  "scenePrompts": [
    "Robot dancer performs intricate moves...",
    "Closeup of the robot dancer's face...",
    "Robot dancer spins on a rooftop terrace..."
  ],
  "finalVideoUrl": null,
  "isCompleted": false,
  "generationStatus": "generating"
}
```

When `isCompleted: true` and `finalVideoUrl` is populated, the video is ready.

## Credits Required

- **Total**: ~1000 credits per 30-second video
  - Lyrics generation: Free
  - Song generation: Free  
  - Character image: Free
  - Scene images: Free
  - Video generation (30s): ~1000 credits

## Technical Details

### Video Specifications
- Duration: 30 seconds
- Scenes: 3 dynamic scenes
- Audio segments: 3 parts (10 seconds each)
- Resolution: 16:9 aspect ratio
- Format: MP4 with HLS streaming support

### AI Services Used
1. **OpenAI GPT-4**: Prompt parsing, lyrics generation, scene prompts
2. **ElevenLabs**: AI music generation (30-second songs)
3. **Fal.ai Imagen4**: Character image generation
4. **Wavespeed AI**: Scene image and video generation
5. **FFMPEG API**: Audio splitting and video merging

### Async Processing
Video generation runs asynchronously after the API returns. The process typically takes 2-5 minutes depending on queue length. Poll the `/api/projects/{projectId}` endpoint every 5 seconds to check status.

## Error Handling

The endpoint includes comprehensive error handling with detailed logging:

- Validates user authentication and credits
- Retries failed AI service calls (up to 3 times)
- Provides detailed error messages for debugging
- Logs all steps with `[NEON-SINGLE-PROMPT]` prefix for easy tracking

## Example Integration

### JavaScript/Node.js
```javascript
const generateVideo = async (prompt, authToken) => {
  const response = await fetch('https://your-domain.replit.dev/api/neon-single-prompt', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `auth_token=${authToken}`
    },
    body: JSON.stringify({ prompt })
  });
  
  const data = await response.json();
  
  if (data.success) {
    console.log('Project ID:', data.projectId);
    
    // Poll for completion
    const checkStatus = setInterval(async () => {
      const projectResponse = await fetch(
        `https://your-domain.replit.dev/api/projects/${data.projectId}`,
        { headers: { 'Cookie': `auth_token=${authToken}` } }
      );
      const project = await projectResponse.json();
      
      if (project.isCompleted && project.finalVideoUrl) {
        console.log('Video ready:', project.finalVideoUrl);
        clearInterval(checkStatus);
      }
    }, 5000);
  }
};

generateVideo(
  "A disco ball hamster performing 'Funky Town' in a 70s roller rink",
  "your_jwt_token_here"
);
```

### Python
```python
import requests
import time

def generate_video(prompt, auth_token):
    url = "https://your-domain.replit.dev/api/neon-single-prompt"
    headers = {
        "Content-Type": "application/json",
        "Cookie": f"auth_token={auth_token}"
    }
    data = {"prompt": prompt}
    
    response = requests.post(url, json=data, headers=headers)
    result = response.json()
    
    if result.get("success"):
        project_id = result["projectId"]
        print(f"Project ID: {project_id}")
        
        # Poll for completion
        while True:
            project_response = requests.get(
                f"https://your-domain.replit.dev/api/projects/{project_id}",
                headers=headers
            )
            project = project_response.json()
            
            if project.get("isCompleted") and project.get("finalVideoUrl"):
                print(f"Video ready: {project['finalVideoUrl']}")
                break
            
            time.sleep(5)

generate_video(
    "A rockstar penguin performing 'Ice Ice Baby' in Antarctica",
    "your_jwt_token_here"
)
```

## Rate Limiting

No explicit rate limiting is enforced, but:
- Users are limited by available credits
- Video generation queue may delay processing during high load
- Maximum 5-minute timeout per video generation request

## Best Practices

1. **Detailed Prompts**: Include character, song title, and setting for best results
   - Good: "A steampunk owl performing 'Clockwork Symphony' in a Victorian workshop"
   - Bad: "Make a music video"

2. **Credit Management**: Check user credits before calling the endpoint
   ```bash
   curl https://your-domain.replit.dev/api/me \
     -H "Cookie: auth_token=YOUR_TOKEN"
   ```

3. **Status Polling**: Poll every 5 seconds, with max 5-minute timeout

4. **Error Handling**: Implement retry logic for network errors (not for credit errors)

## Support

For issues or questions, check server logs with the `[NEON-SINGLE-PROMPT]` prefix for detailed step-by-step execution traces.
