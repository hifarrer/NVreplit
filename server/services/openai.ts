import OpenAI from "openai";
import fs from "fs";
import FormData from "form-data";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
// Validate API key exists
if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY environment variable is required");
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function transcribeAudio(audioFilePath: string): Promise<string> {
  try {
    console.log("Starting Whisper transcription for:", audioFilePath);
    
    const audioFile = fs.createReadStream(audioFilePath);
    
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      response_format: "text",
      language: "en",
      temperature: 0,
    });

    console.log("Transcription completed successfully");
    console.log("Transcribed text:", transcription);
    console.log("Transcribed text length:", transcription.length);
    
    return transcription;
  } catch (error) {
    console.error("Whisper transcription error:", error);
    throw new Error(`Failed to transcribe audio: ${(error as Error).message}`);
  }
}

export async function generateLyrics(
  songDescription: string,
  duration: number = 120, // Parameter kept for backward compatibility but not used
): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a creative songwriter. Generate meaningful lyrics based on the provided description. Include verses, chorus, and bridge sections as appropriate. IMPORTANT: Format section headers ONLY using square brackets like [Verse 1], [Chorus], [Bridge], [Verse 2], etc. NEVER use asterisks (**), markdown formatting, or any other symbols for section headers. Only use square brackets [ ].",
        },
        {
          role: "user",
          content: `Generate lyrics for a song about: ${songDescription}

The song should be between 120 and 180 seconds long.`,
        },
      ],
      max_completion_tokens: 3000,
    });

    const rawLyrics = response.choices[0].message.content || "";

    // Post-process to fix formatting: convert *Section:* or **Section:** to [Section]
    const processedLyrics = rawLyrics
      .replace(/\*{1,2}(Verse \d+)\*{1,2}:?/g, "[$1]")
      .replace(/\*{1,2}(Chorus)\*{1,2}:?/g, "[$1]")
      .replace(/\*{1,2}(Bridge)\*{1,2}:?/g, "[$1]")
      .replace(/\*{1,2}(Outro)\*{1,2}:?/g, "[$1]")
      .replace(/\*{1,2}(Intro)\*{1,2}:?/g, "[$1]")
      .replace(/\*{1,2}(Pre-Chorus)\*{1,2}:?/g, "[$1]")
      .replace(/\*{1,2}(Refrain)\*{1,2}:?/g, "[$1]");

    return processedLyrics;
  } catch (error) {
    console.error("OpenAI lyrics generation error:", error);
    throw new Error("Failed to generate lyrics: " + (error as Error).message);
  }
}

// Generate lyrics with a song title
export async function generateLyricsWithTitle(
  songDescription: string,
  duration: number = 120, // Parameter kept for backward compatibility but not used
): Promise<{ lyrics: string; title: string }> {
  try {
    const systemPrompt = `You are a creative songwriter. You MUST respond with valid JSON containing exactly two fields: "title" and "lyrics".

The JSON response format MUST be:
{
  "title": "Song Title Here",
  "lyrics": "Complete lyrics here with [Section] headers"
}

Format section headers ONLY using square brackets like [Verse 1], [Chorus], [Bridge], [Verse 2], etc. NEVER use asterisks or markdown.`;

    const userPrompt = `Generate a song title and lyrics for a song about: ${songDescription}

The song should be between 120 and 180 seconds long.

IMPORTANT: Return ONLY a valid JSON object with exactly these two fields:
{
  "title": "Your Creative Song Title",
  "lyrics": "[Verse 1]\nLyrics here...\n\n[Chorus]\nMore lyrics..."
}`;

    const response = await openai.chat.completions.create({
      // Using gpt-4o-mini for better reliability and cost efficiency
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      max_completion_tokens: 3000, // Increased to support longer songs up to 180 seconds
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    
    if (!content || content === "{}") {
      console.error("Empty or invalid response from OpenAI");
      console.error("Full OpenAI response:", JSON.stringify(response, null, 2));
      throw new Error("OpenAI returned an empty response. Please try again.");
    }
    
    console.log("OpenAI response content:", content);
    
    let result;
    try {
      result = JSON.parse(content);
    } catch (parseError) {
      console.error("Failed to parse OpenAI response as JSON:", content);
      throw new Error("Invalid JSON response from OpenAI");
    }

    if (!result.lyrics || !result.title) {
      throw new Error("Invalid response format from OpenAI - missing required fields");
    }

    // Post-process to fix formatting: convert *Section:* or **Section:** to [Section]
    const processedLyrics = result.lyrics
      .replace(/\*{1,2}(Verse \d+)\*{1,2}:?/g, "[$1]")
      .replace(/\*{1,2}(Chorus)\*{1,2}:?/g, "[$1]")
      .replace(/\*{1,2}(Bridge)\*{1,2}:?/g, "[$1]")
      .replace(/\*{1,2}(Outro)\*{1,2}:?/g, "[$1]")
      .replace(/\*{1,2}(Intro)\*{1,2}:?/g, "[$1]")
      .replace(/\*{1,2}(Pre-Chorus)\*{1,2}:?/g, "[$1]")
      .replace(/\*{1,2}(Refrain)\*{1,2}:?/g, "[$1]");

    return {
      lyrics: processedLyrics,
      title: result.title,
    };
  } catch (error) {
    console.error("OpenAI lyrics and title generation error:", error);
    throw new Error("Failed to generate lyrics and title: " + (error as Error).message);
  }
}


// Helper function to split lyrics into sections dynamically
export function splitLyricsIntoSections(
  lyrics: string,
  numberOfSections: number = 4,
): string[] {
  // Split by section headers to get individual sections
  const parts = lyrics
    .split(/(\[(?:Verse \d+|Chorus|Bridge|Outro|Intro|Pre-Chorus|Refrain)\])/i)
    .filter((part) => part.trim().length > 0);

  const sections: string[] = [];
  let currentHeader = "";

  // Combine headers with their content
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();

    if (
      part.match(
        /^\[(?:Verse \d+|Chorus|Bridge|Outro|Intro|Pre-Chorus|Refrain)\]$/i,
      )
    ) {
      currentHeader = part;
    } else if (currentHeader) {
      sections.push(currentHeader + "\n" + part);
      currentHeader = "";
    }
  }

  // If we have exactly the required number of sections, return them
  if (sections.length === numberOfSections) {
    return sections;
  }

  // If we have fewer sections than needed, pad with the last section repeated
  if (sections.length < numberOfSections) {
    const lastSection =
      sections[sections.length - 1] || "[Verse 1]\nGenerated content";
    while (sections.length < numberOfSections) {
      sections.push(lastSection);
    }
    return sections;
  }

  // If we have more sections than needed, take the first N sections
  if (sections.length > numberOfSections) {
    return sections.slice(0, numberOfSections);
  }

  // Fallback: split lyrics into equal parts by lines
  const lines = lyrics.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    // Generate placeholder sections
    const placeholders = [];
    const sectionTypes = [
      "Verse 1",
      "Chorus",
      "Verse 2",
      "Bridge",
      "Verse 3",
      "Outro",
    ];
    for (let i = 0; i < numberOfSections; i++) {
      const sectionType = sectionTypes[i % sectionTypes.length];
      placeholders.push(`[${sectionType}]\nGenerated content`);
    }
    return placeholders;
  }

  const linesPerSection = Math.ceil(lines.length / numberOfSections);
  const result = [];

  for (let i = 0; i < numberOfSections; i++) {
    const start = i * linesPerSection;
    const end = Math.min((i + 1) * linesPerSection, lines.length);
    result.push(lines.slice(start, end).join("\n"));
  }

  return result;
}

export async function generateScenePrompts(
  songDescription: string,
  numberOfScenes: number = 8,
  lyricsSections?: string[],
): Promise<string[]> {
  try {
    // Determine which scenes will be used for infinitetalk (lipsync) vs seedance (regular)
    // For 30-second videos (3 scenes): scene 1 is seedance, scenes 2-3 are infinitetalk
    // For other videos: they alternate starting with seedance
    const isThirtySecondVideo = numberOfScenes === 3;
    
    // Create prompts for the specified number of scenes
    let userContent = `Generate ${numberOfScenes} SHORT and CONCISE image prompts for a music video based on "${songDescription}". Each prompt must be 1-2 sentences maximum.

IMPORTANT PATTERN:
${isThirtySecondVideo ? 
  `Scene 1: REGULAR video (wider shots allowed, dynamic movements)
Scene 2: LIPSYNC video (CLOSEUP required, slight camera movements)
Scene 3: LIPSYNC video (CLOSEUP required, slight camera movements)` :
  `ODD scenes (1, 3, 5, etc.): REGULAR videos (wider shots allowed, more dynamic)
EVEN scenes (2, 4, 6, etc.): LIPSYNC videos (CLOSEUPS required, slight camera movements)`}

REQUIREMENTS FOR REGULAR SCENES:
- Can use wider shots and full body views
- Dynamic camera movements allowed (zoom, pan, dolly, etc.)
- Character can be at various distances
- More creative freedom with angles and movements
- background description should be a description of the background of the scene.
- Never a closeup of the character.
- Never a character singing or with a microphone.
- Can have slow motion movements.

REQUIREMENTS FOR LIPSYNC SCENES:
- MUST be CLOSEUP shots (head and shoulders, face clearly visible)
- Use front-facing, side profile, or 3/4 angle shots
- Character MUST be prominent and close to camera
- Use SLIGHT camera movements (slowly panning to the side, gently rotating around character, subtle zoom in/out, slight tilt)
- Focus on character's face for lip synchronization
- Character should be singing or speaking.
- background description should match the background description in the other scenes.

General Requirements:
- Each prompt must include a specific CHARACTER ACTION
- Each prompt must include appropriate CAMERA positioning
- Keep prompts simple and focused
- Character must be present in ALL scenes

Example REGULAR scene: "Character dancing on rooftop with city skyline. Camera dollies back revealing full scene."
Example LIPSYNC scene: "Closeup of character's face singing emotionally. Camera slowly pans to the right revealing her profile."`;

    // If we have lyrics sections, add them to the prompt for better scene generation
    if (lyricsSections && lyricsSections.length > 0) {
      userContent += "\n\nBase scenes on these lyrics (keep prompts SHORT):\n";

      // Distribute lyrics sections across the number of scenes
      const scenesPerSection = Math.ceil(
        numberOfScenes / lyricsSections.length,
      );

      for (let i = 0; i < lyricsSections.length; i++) {
        const startScene = i * scenesPerSection + 1;
        const endScene = Math.min((i + 1) * scenesPerSection, numberOfScenes);
        let sceneRange =
          startScene === endScene
            ? `Scene ${startScene}`
            : `Scenes ${startScene}-${endScene}`;

        let instruction = "";
        // Add instructions based on the intercalation pattern
        if (isThirtySecondVideo) {
          // For 30-second videos: scene 1 is regular, scenes 2-3 are lipsync
          if (i === 0) instruction = " - REGULAR scene with wider establishing shot";
          else instruction = " - LIPSYNC scene with closeup character singing";
        } else {
          // For other videos: maintain the pattern guidance
          if (i === 0) instruction = " - Mix of REGULAR (odd scenes) and LIPSYNC (even scenes)";
          else if (i === lyricsSections.length - 1)
            instruction = " - Character actively singing (follow REGULAR/LIPSYNC pattern)";
          else
            instruction = " - Follow REGULAR/LIPSYNC pattern for each scene";
        }

        userContent += `${sceneRange}: ${lyricsSections[i] || "[Instrumental]"}${instruction}\n`;
      }
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a creative director for music videos. Generate ${numberOfScenes} SHORT and CONCISE scene prompts (1-2 sentences each). 
CRITICAL: Follow the REGULAR vs LIPSYNC pattern exactly as specified.
- REGULAR scenes: wider shots, dynamic movements, background description.
- LIPSYNC scenes: CLOSEUPS only, minimal camera movement, face clearly visible, background description should match the background description in the other scenes.
Each prompt must include a specific character action and appropriate camera positioning.
Keep them simple and focused for video generation.
Respond with JSON in this format: {"prompts": [${Array(
            numberOfScenes,
          )
            .fill(0)
            .map((_, i) => `"scene ${i + 1} description"`)
            .join(", ")}]}`,
        },
        {
          role: "user",
          content: userContent,
        },
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    let prompts = result.prompts || [];
    
    // Validate that prompts is actually an array
    if (!Array.isArray(prompts)) {
      console.error("⚠️ OpenAI response 'prompts' is not an array:", typeof prompts);
      prompts = [];
    }
    
    // CRITICAL: Ensure we have exactly the requested number of scenes
    console.log(`OpenAI returned ${prompts.length} prompts, requested ${numberOfScenes}`);
    
    if (prompts.length < numberOfScenes) {
      // If OpenAI returned fewer scenes, generate fallback prompts that respect the REGULAR/LIPSYNC pattern
      console.warn(`⚠️ OpenAI returned ${prompts.length} scenes instead of ${numberOfScenes}. Generating fallback prompts.`);
      
      while (prompts.length < numberOfScenes) {
        const sceneIndex = prompts.length;
        const sceneNumber = sceneIndex + 1;
        
        // Determine if this should be a REGULAR or LIPSYNC scene
        const isLipsyncScene = isThirtySecondVideo 
          ? (sceneNumber === 2 || sceneNumber === 3)  // For 30s: scenes 2-3 are lipsync
          : (sceneNumber % 2 === 0);  // For others: even scenes are lipsync
        
        const fallbackPrompt = isLipsyncScene
          ? `Closeup of character's face as they sing passionately. Camera slowly pans around to capture their emotion.`
          : `Character performs energetically in a vibrant setting. Camera pulls back to reveal the full scene.`;
        
        prompts.push(fallbackPrompt);
      }
    } else if (prompts.length > numberOfScenes) {
      // If OpenAI returned more scenes, trim to exact count
      console.warn(`⚠️ OpenAI returned ${prompts.length} scenes instead of ${numberOfScenes}. Trimming excess.`);
      prompts = prompts.slice(0, numberOfScenes);
    }
    
    console.log(`✓ Returning exactly ${prompts.length} scene prompts`);
    return prompts;
  } catch (error) {
    console.error("OpenAI scene generation error:", error);
    throw new Error(
      "Failed to generate scene prompts: " + (error as Error).message,
    );
  }
}

/**
 * Generate scene prompts specifically for instrumental videos (no characters)
 */
export async function generateInstrumentalScenePrompts(
  songDescription: string,
  numberOfScenes: number = 8,
): Promise<string[]> {
  try {
    // Create prompts for instrumental videos - NO CHARACTERS, cinematic/epic focus
    let userContent = `Generate ${numberOfScenes} SHORT and CONCISE image prompts for a cinematic instrumental music video based on "${songDescription}". Each prompt must be 1-2 sentences maximum.

CRITICAL REQUIREMENTS:
- Use descriptive keywords like: cinematic, epic, dramatic, atmospheric, sweeping, majestic, grand, powerful, emotional, immersive
- Each scene should be visually stunning and suitable for instrumental music
- Include appropriate CAMERA positioning and movements
- Keep prompts simple and focused on visual storytelling

SCENE REQUIREMENTS:
- Most scenes should be wide, cinematic shots 
- Dynamic camera movements allowed (zoom, pan, dolly, tilt, etc.)
- Focus on atmosphere, mood, and visual impact
- Scenes should flow naturally from one to the next

Example scenes:
- "Sweeping aerial view of a misty mountain range at sunrise, camera slowly descends revealing valleys below."
- "Epic cinematic shot of crashing ocean waves against dramatic cliffs, camera pans across the horizon."
- "Majestic cityscape at night with neon lights reflecting in puddles, camera dollies forward through the scene."
- "Abstract geometric patterns forming in space, camera rotates around the visual elements."
- "Dramatic desert landscape with sand dunes shifting in the wind, camera pulls back to reveal vast expanse."`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a creative director for cinematic instrumental music videos. Generate ${numberOfScenes} SHORT and CONCISE scene prompts (1-2 sentences each) for instrumental videos.
CRITICAL: NO characters, people, or individuals in any scene. Focus on cinematic visuals, epic landscapes, atmospheric environments, or abstract imagery.
Use keywords like: cinematic, epic, dramatic, atmospheric, sweeping, majestic, grand, powerful, emotional, immersive.
Each prompt must include camera positioning and movements.
Keep them simple and focused for video generation.
Respond with JSON in this format: {"prompts": [${Array(
            numberOfScenes,
          )
            .fill(0)
            .map((_, i) => `"scene ${i + 1} description"`)
            .join(", ")}]}`,
        },
        {
          role: "user",
          content: userContent,
        },
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    let prompts = result.prompts || [];
    
    // Validate that prompts is actually an array
    if (!Array.isArray(prompts)) {
      console.error("⚠️ OpenAI response 'prompts' is not an array:", typeof prompts);
      prompts = [];
    }
    
    // CRITICAL: Ensure we have exactly the requested number of scenes
    console.log(`OpenAI returned ${prompts.length} prompts for instrumental video, requested ${numberOfScenes}`);
    
    if (prompts.length < numberOfScenes) {
      // Generate fallback prompts for instrumental videos (no characters)
      console.warn(`⚠️ OpenAI returned ${prompts.length} scenes instead of ${numberOfScenes}. Generating fallback prompts.`);
      
      const fallbackPrompts = [
        "Sweeping cinematic view of a vast landscape at golden hour, camera slowly pans across the horizon.",
        "Epic aerial shot of dramatic cloud formations over mountains, camera descends revealing the terrain below.",
        "Majestic cityscape at night with neon lights and reflections, camera dollies forward through the urban scene.",
        "Abstract geometric patterns forming in space with dynamic lighting, camera rotates around the visual elements.",
        "Dramatic ocean waves crashing against rocky cliffs, camera pulls back to reveal the full coastal scene.",
        "Atmospheric forest scene with mist and light rays, camera slowly moves through the trees.",
        "Grand desert landscape with shifting sand dunes, camera pans across the vast expanse.",
        "Cinematic shot of a starry night sky over silhouetted mountains, camera tilts up revealing the cosmos.",
      ];
      
      while (prompts.length < numberOfScenes) {
        const fallbackIndex = prompts.length % fallbackPrompts.length;
        prompts.push(fallbackPrompts[fallbackIndex]);
      }
    } else if (prompts.length > numberOfScenes) {
      // If OpenAI returned more scenes, trim to exact count
      console.warn(`⚠️ OpenAI returned ${prompts.length} scenes instead of ${numberOfScenes}. Trimming excess.`);
      prompts = prompts.slice(0, numberOfScenes);
    }
    
    console.log(`✓ Returning exactly ${prompts.length} instrumental scene prompts (no characters)`);
    return prompts;
  } catch (error) {
    console.error("OpenAI instrumental scene generation error:", error);
    throw new Error(
      "Failed to generate instrumental scene prompts: " + (error as Error).message,
    );
  }
}

/**
 * Generate scene prompts specifically for lyric videos
 * Characters are allowed but must NEVER be shown singing or with a microphone
 */
export async function generateLyricVideoScenePrompts(
  songDescription: string,
  numberOfScenes: number = 8,
): Promise<string[]> {
  try {
    // Create prompts for lyric videos - characters allowed but NO singing/microphones
    let userContent = `Generate ${numberOfScenes} SHORT and CONCISE image prompts for a lyric music video based on "${songDescription}". Each prompt must be 1-2 sentences maximum.

CRITICAL REQUIREMENTS:
- Characters are allowed and can be included in scenes (e.g., cowboy hamster, kitty astronaut, etc.)
- NEVER show a character singing, speaking into a microphone, or holding a microphone
- Characters should be shown doing actions, exploring, or in scenes related to the description
- Use descriptive keywords like: cinematic, dynamic, vibrant, atmospheric, engaging, visually appealing
- Each scene should be visually interesting and suitable for a lyric video
- Include appropriate CAMERA positioning and movements
- Keep prompts simple and focused on visual storytelling
- NO profanity, inappropriate content, or offensive material allowed

SCENE REQUIREMENTS:
- Can include characters, animals, objects, landscapes, or abstract scenes based on the description
- Dynamic camera movements allowed (zoom, pan, dolly, tilt, etc.)
- Focus on atmosphere, mood, and visual storytelling
- Scenes should flow naturally from one to the next
- If characters are present, show them in action (walking, exploring, dancing, playing, etc.) but NEVER singing

Example scenes (with characters):
- "Cowboy hamster riding through a desert landscape on a tiny horse, camera follows from the side as they move forward."
- "Kitty astronaut floating in space near colorful planets, camera slowly rotates around the scene."
- "Character dancing on a rooftop with city skyline in background, camera dollies back revealing full scene."

Example scenes (without characters):
- "Volcanoes erupting with lava flows and ash clouds, camera pans across the dramatic landscape."
- "Life under the sea with colorful coral reefs and tropical fish, camera slowly moves through the underwater scene."
- "Abstract geometric patterns forming in space with dynamic lighting, camera rotates around the visual elements."`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a creative director for lyric music videos. Generate ${numberOfScenes} SHORT and CONCISE scene prompts (1-2 sentences each) for lyric videos.
CRITICAL RULES:
- Characters are ALLOWED and can be included (animals, people, creatures, etc.)
- NEVER show characters singing, speaking into a microphone, or holding a microphone
- Characters should be shown doing actions, exploring, dancing, playing, or in scenes - but NEVER singing
- Can also generate scenes without characters (landscapes, nature, abstract, etc.)
- NO profanity, inappropriate content, or offensive material
- Use keywords like: cinematic, dynamic, vibrant, atmospheric, engaging, visually appealing
- Each prompt must include camera positioning and movements
- Keep them simple and focused for video generation
- Base scenes on the song description provided
Respond with JSON in this format: {"prompts": [${Array(
            numberOfScenes,
          )
            .fill(0)
            .map((_, i) => `"scene ${i + 1} description"`)
            .join(", ")}]}`,
        },
        {
          role: "user",
          content: userContent,
        },
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    let prompts = result.prompts || [];
    
    // Validate that prompts is actually an array
    if (!Array.isArray(prompts)) {
      console.error("⚠️ OpenAI response 'prompts' is not an array:", typeof prompts);
      prompts = [];
    }
    
    // Filter out any prompts that contain singing/microphone references (safety check)
    prompts = prompts.map((prompt: string) => {
      const lowerPrompt = prompt.toLowerCase();
      // Remove or replace any mentions of singing or microphones
      if (lowerPrompt.includes("singing") || lowerPrompt.includes("microphone") || lowerPrompt.includes("mic")) {
        console.warn(`⚠️ Filtered out prompt with singing/microphone: ${prompt}`);
        // Replace with a safe alternative
        return prompt
          .replace(/singing/gi, "dancing")
          .replace(/microphone/gi, "")
          .replace(/mic/gi, "")
          .replace(/\s+/g, " ")
          .trim();
      }
      return prompt;
    });
    
    // CRITICAL: Ensure we have exactly the requested number of scenes
    console.log(`OpenAI returned ${prompts.length} prompts for lyric video, requested ${numberOfScenes}`);
    
    if (prompts.length < numberOfScenes) {
      // Generate fallback prompts for lyric videos (characters allowed but no singing)
      console.warn(`⚠️ OpenAI returned ${prompts.length} scenes instead of ${numberOfScenes}. Generating fallback prompts.`);
      
      const fallbackPrompts = [
        "Character exploring a vibrant landscape, camera follows from behind as they move forward.",
        "Dynamic scene with colorful elements and engaging visuals, camera slowly pans across the scene.",
        "Character in action performing movements, camera dollies around to capture different angles.",
        "Atmospheric environment with interesting details, camera pulls back to reveal the full scene.",
        "Character interacting with their surroundings, camera moves through the scene dynamically.",
        "Visually appealing composition with dynamic elements, camera rotates around the visual space.",
        "Engaging scene with character in motion, camera follows the action smoothly.",
        "Cinematic view of an interesting environment, camera tilts and pans to reveal details.",
      ];
      
      while (prompts.length < numberOfScenes) {
        const fallbackIndex = prompts.length % fallbackPrompts.length;
        prompts.push(fallbackPrompts[fallbackIndex]);
      }
    } else if (prompts.length > numberOfScenes) {
      // If OpenAI returned more scenes, trim to exact count
      console.warn(`⚠️ OpenAI returned ${prompts.length} scenes instead of ${numberOfScenes}. Trimming excess.`);
      prompts = prompts.slice(0, numberOfScenes);
    }
    
    console.log(`✓ Returning exactly ${prompts.length} lyric video scene prompts`);
    return prompts;
  } catch (error) {
    console.error("OpenAI lyric video scene generation error:", error);
    throw new Error(
      "Failed to generate lyric video scene prompts: " + (error as Error).message,
    );
  }
}

/**
 * Generate a sequential scene prompt formatted for seedream-v4.5/edit-sequential API
 * This creates a single prompt that describes all scenes in sequence format
 */
export async function generateSequentialScenePrompt(
  songDescription: string,
  numberOfScenes: number = 8,
  lyricsSections?: string[],
): Promise<string> {
  try {
    // First, get individual scene prompts using existing logic
    const individualPrompts = await generateScenePrompts(
      songDescription,
      numberOfScenes,
      lyricsSections,
    );

    // Extract style from song description or default to "cartoon"
    // Try to detect style keywords
    const descriptionLower = songDescription.toLowerCase();
    let style = "cartoon";
    if (descriptionLower.includes("realistic") || descriptionLower.includes("real")) {
      style = "realistic";
    } else if (descriptionLower.includes("anime")) {
      style = "anime";
    } else if (descriptionLower.includes("3d") || descriptionLower.includes("3-d")) {
      style = "3d";
    }

    // Extract character description from song description
    // Try to find character mentions in the description
    let characterDescription = songDescription;
    // If description starts with character info, use it; otherwise use full description
    const characterMatch = songDescription.match(/^(?:a|an|the)\s+([^,]+?)(?:\s+(?:having|doing|at|in|with|on))?/i);
    if (characterMatch) {
      characterDescription = characterMatch[1].trim();
    }

    // Build the sequential prompt
    let sequentialPrompt = `Generate a sequence of ${numberOfScenes} ${style} images of ${characterDescription}.\n`;
    sequentialPrompt += `Style: ${style}\n\n`;

    // Add each scene description
    individualPrompts.forEach((prompt, index) => {
      sequentialPrompt += `Scene ${index + 1} – ${prompt}\n`;
    });

    // Add consistency instruction
    sequentialPrompt += `\nKeep the ${characterDescription} and characters consistent across all ${numberOfScenes} images so they feel like same time of day in the exact same location.`;

    console.log(`✓ Generated sequential prompt for ${numberOfScenes} scenes`);
    return sequentialPrompt;
  } catch (error) {
    console.error("OpenAI sequential scene prompt generation error:", error);
    throw new Error(
      "Failed to generate sequential scene prompt: " + (error as Error).message,
    );
  }
}