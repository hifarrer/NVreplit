# Overview

This is an AI-powered music video maker application that guides users through a multi-step process to create music videos. The application uses modern web technologies with a React frontend, Express backend, and integrates multiple AI services including Minimax Music 02 (via Wavespeed API) for music generation, OpenAI for lyrics and scene prompts, Fal.ai for image generation, and Wavespeed for video creation.

**Note**: ElevenLabs music generation code is preserved in the codebase (`server/services/elevenlabs.ts`) as a fallback option but is not currently used. Minimax Music 02 is the default music generation model.

The workflow consists of six main steps: creating/uploading music, creating/uploading character images, generating scene prompts and images, splitting audio into segments, generating video segments, and merging them into a final music video.

## Credit System

The platform uses a credit-based system for AI generation services. Users on paid plans (Basic, Premium) can purchase additional credits as needed:
- **One-time Credit Purchase**: $9 for 5,000 credits
- **Available to**: Paid subscribers only (Basic and Premium plans)
- **Access Points**: Profile page and Plans page
- **Features**: Instant delivery via Stripe webhook, secure checkout, automatic credit addition

### Credit Pricing
- **Song Generation**: Free (no credits consumed)
- **Video Generation**: 1000 credits per 30 seconds
  - Formula: `Math.ceil(duration / 30) * 1000`
  - Examples:
    - 30s video: 1,000 credits
    - 60s video: 2,000 credits
    - 90s video: 3,000 credits
    - 120s video: 4,000 credits
    - 150s video: 5,000 credits
    - 180s video: 6,000 credits
- **Total Cost**: Only video generation credits (song generation is free)

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack React Query for server state management
- **UI Components**: Radix UI primitives with shadcn/ui design system
- **Styling**: Tailwind CSS with custom CSS variables for theming
- **Form Handling**: React Hook Form with Zod validation

## Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ESM modules
- **API Design**: RESTful API with centralized route registration
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Storage**: In-memory storage implementation with interface for easy swapping
- **Validation**: Zod schemas shared between frontend and backend

## Data Storage
- **Database**: PostgreSQL using Neon Database as the serverless provider
- **ORM**: Drizzle ORM with migrations support
- **Schema**: Main tables include users, projects, generation_logs, banned_users, and more
- **Session Management**: PostgreSQL-based session storage using connect-pg-simple

## Authentication and Authorization
- **Session-based**: Uses Express sessions with PostgreSQL storage
- **User Management**: Username/email and password authentication
- **Project Ownership**: Projects are tied to user IDs for access control
- **User Banning**: Email-based banning system to prevent account misuse
  - Banned users cannot log in or register new accounts
  - Admin dashboard provides ban/unban controls with optional reason
  - Banned status is checked on authentication and registration
  - "Banned Users" filter available in admin user management panel

## External Dependencies

- **Music Generation**: ElevenLabs API for AI song generation from prompts and lyrics
- **Text Generation**: OpenAI GPT-5 for lyrics and scene prompt generation
- **Image Generation**: Fal.ai Imagen4 model for character and scene image creation
- **Video Generation**: Wavespeed AI for converting images and audio into video segments
  - **Non-lipsync model**: bytedance/seedance-v1-pro-i2v-480p (10-second limit)
  - **Lipsync model**: infinitetalk-fast (no limit, but uses 10-second segments)
- **Audio Processing**: FFMPEG API for splitting audio tracks (10-second segments) and merging video segments with watermark branding
- **Database**: Neon Database (PostgreSQL) for data persistence
- **Deployment**: Replit-optimized with development tooling and error overlays

The application follows a step-by-step wizard pattern where each phase depends on the completion of the previous one, with progress tracking and the ability to resume projects at any stage.

## Video Segmentation Strategy

All video generation uses fixed 10-second segments to ensure compatibility with both lipsync and non-lipsync models:
- Audio is split into 10-second chunks using FFMPEG's split_audio_by_time endpoint
- For a 3-minute song: 18 scenes of 10 seconds each (last segment may be shorter)
- Video generation queue limits concurrent API calls to 8 at a time
- Both models generate 10-second videos to maintain sync in the final merged video

## Duration Limits

The platform enforces different song duration limits based on user plan:
- **Free Users**: Maximum 120 seconds (2 minutes)
- **Paid Users**: Maximum 180 seconds (3 minutes)
- Duration limits apply to both "Generate with AI" and "Upload Audio File" features
- Video generation configs automatically calculate numberOfAudioParts and numberOfScenes as ceil(duration/10)

## Social Media Auto-Posting

The platform automatically posts completed public videos to social media via Postiz API:
- **Endpoint**: `POST /api/cron/auto-post-to-social` (triggered by external cron job)
- **Platforms**: Facebook, YouTube, TikTok, Reddit
- **Features**:
  - AI-generated descriptions for Reddit using OpenAI GPT-4o-mini
  - SEO keywords included: "AI music video", "music video", "music video generator"
  - Shareable link to video on production site: `https://neonvideo.ai/v/{projectId}`
  - Video attachment to posts
- **Reddit-specific**:
  - Posted as separate request to isolate failures from other platforms
  - AI generates title and description based on project context (character, audio prompt, etc.)
  - Channel ID: `cmkzpyncb00sant0yy54mt640`
- **Database tracking**: `postiz_posts` table tracks which videos have been posted to each platform

## OAuth 2.1 API Endpoints

The application provides OAuth 2.1-compliant API endpoints for external integrations:

### Video Generation API
- **POST /api/neon-single-prompt**: Generate a complete music video from a single prompt
  - **Authentication**: Bearer token (OAuth 2.1)
  - **Required Fields**: 
    - `prompt` (string): A description containing character and video description
  - **Optional Fields**: Song title (automatically extracted or generated if not provided)
  - **Returns**: `projectId` for tracking video generation progress
  - **CORS**: Enabled with wildcard origin support

### Status Checking API
- **GET /api/neon-single-prompt/status/:projectId**: Check video generation status asynchronously
  - **Authentication**: Bearer token (OAuth 2.1)
  - **Parameters**: `projectId` from the video generation response
  - **Returns**: 
    - `status`: 'processing', 'completed', or 'failed'
    - `progress`: Percentage completion (0-100)
    - `currentStep`: Current step in the generation process (1-5)
    - `finalVideoUrl`: Available when status is 'completed'
    - `streamingUrl`: Mux HLS streaming URL (if available)
    - `queuePosition`: Position in queue if video is queued
  - **CORS**: Enabled with wildcard origin support

### OAuth 2.1 Discovery Endpoints
- **GET /.well-known/openid-configuration**: OpenID Connect discovery metadata
- **GET /.well-known/oauth-protected-resource**: OAuth protected resource metadata
- **GET /.well-known/jwks.json**: JSON Web Key Set for token verification
- **POST /oauth/register**: Dynamic client registration
- **POST /oauth/authorize**: Authorization endpoint
- **POST /oauth/token**: Token exchange endpoint