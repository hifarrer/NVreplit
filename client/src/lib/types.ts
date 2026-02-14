export interface AudioSegment {
  part: string;
  download_url: string;
}

export interface SceneData {
  prompt: string;
  imageUrl: string;
  lipsync?: boolean;
  videoUrl?: string; // Optional video preview URL for the scene
}

export interface GenerationLog {
  id: string;
  step: string;
  message: string;
  status: 'started' | 'progress' | 'completed' | 'error';
  metadata?: any;
  createdAt: Date;
}

export interface Project {
  id: string;
  userId: string;
  title: string;
  description?: string;
  currentStep: number;
  aspectRatio?: string;
  audioUrl?: string;
  audioType?: 'uploaded' | 'generated';
  audioPrompt?: string;
  audioTags?: string;
  audioLyrics?: string;
  audioDuration?: number;
  characterImageUrl?: string;
  characterType?: 'uploaded' | 'generated';
  characterPrompt?: string;
  makeCharacterSing?: boolean;
  scenePrompts?: string[];
  sceneImages?: string[];
  audioSegments?: AudioSegment[];
  videoSegments?: string[];
  finalVideoUrl?: string;
  isCompleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}
