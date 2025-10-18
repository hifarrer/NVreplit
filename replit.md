# Overview

This is an AI-powered music video maker application that guides users through a multi-step process to create music videos. The application uses modern web technologies with a React frontend, Express backend, and integrates multiple AI services including ElevenLabs for music generation, OpenAI for lyrics and scene prompts, Fal.ai for image generation, and Wavespeed for video creation.

The workflow consists of six main steps: creating/uploading music, creating/uploading character images, generating scene prompts and images, splitting audio into segments, generating video segments, and merging them into a final music video.

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
- **Schema**: Three main tables - users, projects, and generation_logs
- **Session Management**: PostgreSQL-based session storage using connect-pg-simple

## Authentication and Authorization
- **Session-based**: Uses Express sessions with PostgreSQL storage
- **User Management**: Username/email and password authentication
- **Project Ownership**: Projects are tied to user IDs for access control

## External Dependencies

- **Music Generation**: ElevenLabs API for AI song generation from prompts and lyrics
- **Text Generation**: OpenAI GPT-5 for lyrics and scene prompt generation
- **Image Generation**: Fal.ai Imagen4 model for character and scene image creation
- **Video Generation**: Wavespeed AI for converting images and audio into video segments
- **Audio Processing**: FFMPEG API for splitting audio tracks and merging video segments with watermark branding
- **Database**: Neon Database (PostgreSQL) for data persistence
- **Deployment**: Replit-optimized with development tooling and error overlays

The application follows a step-by-step wizard pattern where each phase depends on the completion of the previous one, with progress tracking and the ability to resume projects at any stage.

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