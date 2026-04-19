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

/** Generate a short song title from description and optional tags (e.g. for music-tools generate-song). */
export async function generateSongTitle(
  description?: string,
  tags?: string
): Promise<string> {
  const input = [description, tags].filter(Boolean).join(". ").trim() || "a song";
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a songwriter. Reply with ONLY a short, catchy song title (a few words, no quotes, no period). No other text.",
        },
        {
          role: "user",
          content: `Suggest a song title for a song about: ${input}`,
        },
      ],
      max_completion_tokens: 50,
    });
    const title = response.choices[0]?.message?.content?.trim();
    if (title && title.length > 0 && title.length <= 200) {
      return title;
    }
  } catch (error) {
    console.error("OpenAI song title generation error:", error);
  }
  return (description || tags || "NeonVideo Song").trim().substring(0, 80) || "NeonVideo Song";
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
    // Determine which scenes will be used for ltx-lipsync vs seedance (regular)
    // For 30-second videos (3 scenes): scene 1 is seedance, scenes 2-3 are ltx-lipsync
    // For other videos: they alternate starting with seedance
    const isThirtySecondVideo = numberOfScenes === 3;

    // Create prompts for the specified number of scenes
    let userContent = `Generate ${numberOfScenes} SHORT and CONCISE image prompts for a music video based on this description "${songDescription}". Each prompt must be 1-2 sentences maximum.

FIRST, create a short story based on the song description, this way the scenes will be more coherent and the prompts will be more accurate.
SECOND, create a list of scenes based on the story.
THIRD, create a list of prompts based on the scenes.
FOURTH, keep scene backgrounds mostly consistent across the scenes to make the video more coherent. For example if the first scene is a cityscape, the other scenes should also be cityscapes.

IMPORTANT PATTERN:
${isThirtySecondVideo ?
        `Scene 1: REGULAR video (wider shots allowed, dynamic movements)
Scene 2: LIPSYNC video (CLOSEUP, MEDIUM SHOTS required, slight camera movements)
Scene 3: LIPSYNC video (CLOSEUP, MEDIUM SHOTS required, slight camera movements)` :
        `ODD scenes (1, 3, 5, etc.): REGULAR videos (wider shots allowed, more dynamic)
EVEN scenes (2, 4, 6, etc.): LIPSYNC videos (CLOSEUPS, MEDIUM SHOTS, required, slight camera movements, NO WIDE SHOTS)`}

REQUIREMENTS FOR REGULAR SCENES:
- Can use wider shots and full body views
- Dynamic camera movements allowed (zoom, pan, dolly, etc.)
- Character can be at various distances
- More creative freedom with angles and movements
- background description should be a description of the background of the scene.
- Never a closeup of the character.
- Never a character singing or with a microphone.
- Can have slow motion movements.
- IMPORTANT: keep the style of the image as similar as possible to the attached image.

REQUIREMENTS FOR LIPSYNC SCENES:
- MUST be CLOSEUP OR MEDIUM SHOTS (head and shoulders, face clearly visible)
- Use front-facing, side profile, or 3/4 angle shots
- Use SLIGHT camera movements (slowly panning to the side, gently rotating around character, subtle zoom in/out, slight tilt, slowly rotating camera)
- Character should be singing or speaking.
- background description should match the background description in the other scenes.
- Never a wide shot of the character.

General Requirements:
- Each prompt must include a specific CHARACTER ACTION
- Each prompt must include appropriate CAMERA positioning
- Keep prompts simple and focused
- Character must be present in ALL scenes
- Anchor every scene to the user's description. Do NOT introduce a different main subject, location, or story unless the user description implies it.
- The example scenes below are style references only. NEVER copy them literally.

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
Treat the provided user description as the source of truth. Do not replace it with unrelated themes or locations.
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

export interface StorySceneOutput {
  id: number;
  character: string;
  audio: string;
  scene_description: string;
  multi_talk?: boolean;
  character_left?: string;
  character_right?: string;
  audio_left?: string;
  audio_right?: string;
  multi_talk_order?: "left_right" | "right_left" | "meanwhile";
}

export async function generateStoryScript(
  storyPrompt: string,
  durationSeconds: number,
  hasNarrator: boolean,
  narratorVoice: string | null,
  characters: { name: string; voiceId: string | null }[],
): Promise<StorySceneOutput[]> {
  try {
    const sceneCount = Math.floor(durationSeconds / 5);
    const characterNames = characters.map((c) => c.name);
    const characterList = characterNames.length > 0 ? characterNames.join(", ") : "no named characters";

    const narratorInstruction = hasNarrator
      ? `Include a Narrator character who sets up scenes, provides transitions, and tells the story. The narrator voice ID is "${narratorVoice || "Alex"}".`
      : "Do NOT include a narrator. All storytelling should happen through character dialogue and scene descriptions.";

    const systemPrompt = `You are a professional story writer for short animated videos. Generate a story script as a JSON object.

CRITICAL CONSTRAINTS:
- The total video length is ${durationSeconds} seconds.
- Each scene becomes exactly one 5-second video clip.
- Therefore you MUST generate EXACTLY ${sceneCount} scenes (${durationSeconds}s ÷ 5s = ${sceneCount} clips).
- Each scene's "audio" dialogue/narration must be timed to fit within 5 seconds of spoken audio. This is roughly 1-2 short sentences (about 12-18 words). Do NOT write more than ~20 words per audio line or it will be cut off. Do NOT write fewer than ~8 words or the AI voice model will fail.

Rules:
- Characters available: ${characterList}.
${narratorInstruction}
- Each scene must have: id (sequential number starting at 1), character (who is speaking — either "Narrator" or a character name), audio (the dialogue or narration text for that 5-second clip), and scene_description (visual description of what should be shown).
- Distribute dialogue naturally among all characters. Each character should speak at least once.
- Scene descriptions should be vivid and specific, describing camera angles, settings, and character actions.
- When multiple named characters are available, include several scenes where they interact together (not only solo shots). Name each character in the scene_description when they are visible so image generation can align with their reference portraits.
- The story should have a clear beginning, middle, and end within exactly ${sceneCount} scenes.

MULTI-CHARACTER LIPSYNC (critical when two named characters appear together in the same shot):
- If the scene shows TWO characters on screen at once (both faces visible, conversation between two named characters from the list), set multi_talk: true.
- For multi_talk scenes you MUST also set: character_left and character_right (exact names from the character list, left-to-right from the VIEWER'S perspective), audio_left and audio_right (each about 6-12 words, together fitting ~5 seconds), and scene_description MUST state clearly who stands on the LEFT and who on the RIGHT of the frame.
- Set character to the name of whoever speaks first in the clip. Set audio to a short summary or the same text as audio_left for backward compatibility.
- For multi_talk, multi_talk_order is optional: use "left_right" (default) if the left character speaks first, "right_left" if the right speaks first, or "meanwhile" if both speak over each other.
- Do NOT set multi_talk for narrator-only shots, single-character shots, or when only one face is visible — use multi_talk: false or omit it (single-speaker infinitetalk).

- Output ONLY a JSON object with a single key "scenes" containing an array of exactly ${sceneCount} scene objects.`;

    console.log(`[Story Script] Generating exactly ${sceneCount} scenes for "${storyPrompt}" (${durationSeconds}s = ${sceneCount} x 5s clips)`);
    console.log(`[Story Script] Characters: ${characterList}, Narrator: ${hasNarrator}`);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Generate a story script about: ${storyPrompt}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.8,
      max_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No content returned from OpenAI");
    }

    const parsed = JSON.parse(content);
    const scenes: StorySceneOutput[] = parsed.scenes;

    if (!Array.isArray(scenes) || scenes.length === 0) {
      throw new Error("OpenAI returned empty or invalid scenes array");
    }

    const canonicalNames = hasNarrator ? ["Narrator", ...characterNames] : [...characterNames];
    const canonicalLookup = new Map(canonicalNames.map((n) => [n.trim().toLowerCase(), n]));

    function fixCharacterName(raw: string | undefined): string {
      if (!raw) return "";
      const key = raw.trim().toLowerCase();
      return canonicalLookup.get(key) ?? raw.trim();
    }

    for (const scene of scenes) {
      scene.character = fixCharacterName(scene.character);
      if (scene.character_left) scene.character_left = fixCharacterName(scene.character_left);
      if (scene.character_right) scene.character_right = fixCharacterName(scene.character_right);
    }

    scenes.forEach((scene, i) => {
      scene.id = i + 1;
      if (scene.multi_talk) {
        const left = (scene.audio_left || "").trim();
        const right = (scene.audio_right || "").trim();
        scene.audio_left = left;
        scene.audio_right = right;
        if (!left || !right) {
          console.warn(
            `[Story Script] Scene ${scene.id}: multi_talk without both lines — falling back to single-speaker`,
          );
          scene.multi_talk = false;
        } else {
          if (!scene.audio || !String(scene.audio).trim()) {
            scene.audio = [left, right].filter(Boolean).join(" ").trim() || left || right;
          }
          if (!scene.multi_talk_order) {
            scene.multi_talk_order = "left_right";
          }
        }
      }
      if (!scene.multi_talk) {
        scene.multi_talk = false;
      }
    });

    console.log(`[Story Script] Generated ${scenes.length} scenes successfully`);
    return scenes;
  } catch (error) {
    console.error("[Story Script] Generation error:", error);
    throw new Error("Failed to generate story script: " + (error as Error).message);
  }
}

/**
 * Generate scene prompts for all-purpose / long format video.
 * Returns both an image_prompt (for Seedream still generation) and
 * a video_prompt (for the image-to-video model) per scene.
 */
export async function generateAllPurposeScenePrompts(
  videoDescription: string,
  numberOfScenes: number,
  useAudio: boolean,
): Promise<{ image_prompt: string; video_prompt: string }[]> {
  try {
    const audioInstruction = useAudio
      ? `Each video_prompt MAY include short dialogue or sound-effect cues when it enhances the scene (dialogue MUST be under 9 seconds when spoken aloud). Not every scene needs dialogue — use it only when it adds value.`
      : `Do NOT include any dialogue or spoken audio cues in the video_prompt. Describe only visual action and camera movement.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a creative director for professional video production. You generate scene breakdowns for any type of video — commercials, tutorials, stories, promos, cinematic shorts, etc.

Given a video description, generate exactly ${numberOfScenes} scenes. Each scene will become a ~10 second video clip.

For every scene produce TWO prompts:
1. image_prompt — a concise (1-2 sentence) description of a STILL IMAGE that serves as the first frame / key-frame of the scene. Include subject, setting, lighting, and composition.
2. video_prompt — a concise (1-3 sentence) description of the VIDEO MOTION for the scene. Describe what happens, camera movement, and any on-screen action.

Rules:
- Keep visual style, setting, and characters consistent across all scenes.
- Create a coherent narrative arc across the scenes.
- Vary camera angles and shot types (wide, medium, close-up, tracking, etc.) for visual interest.
- ${audioInstruction}

Respond with JSON: {"scenes": [{"image_prompt": "...", "video_prompt": "..."}, ...]}`,
        },
        {
          role: "user",
          content: `Generate ${numberOfScenes} scene breakdowns for this video:\n\n"${videoDescription}"`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    const scenes: { image_prompt: string; video_prompt: string }[] = result.scenes || [];

    if (scenes.length === 0) {
      throw new Error("OpenAI returned no scenes");
    }

    // Pad or trim to exactly the requested count
    while (scenes.length < numberOfScenes) {
      scenes.push(scenes[scenes.length - 1]);
    }

    console.log(`[All-Purpose] Generated ${scenes.length} scene prompts (useAudio=${useAudio})`);
    return scenes.slice(0, numberOfScenes);
  } catch (error) {
    console.error("[All-Purpose] Scene prompt generation error:", error);
    throw new Error("Failed to generate scene prompts: " + (error as Error).message);
  }
}