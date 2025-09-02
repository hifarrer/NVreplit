import OpenAI from "openai";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({
  apiKey:
    process.env.OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY_ENV_VAR ||
    "default_key",
});

export async function generateLyrics(
  songDescription: string,
  duration: number = 120,
): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a creative songwriter. Generate meaningful lyrics based on the provided description. Include verses, chorus, and bridge sections as appropriate for the song duration. IMPORTANT: Format section headers ONLY using square brackets like [Verse 1], [Chorus], [Bridge], [Verse 2], etc. NEVER use asterisks (**), markdown formatting, or any other symbols for section headers. Only use square brackets [ ].",
        },
        {
          role: "user",
          content: `Generate lyrics for a song about: ${songDescription}

CRITICAL: The song is EXACTLY ${duration} seconds long. You MUST follow these structures EXACTLY:

${
  duration === 30
    ? `
STRUCTURE FOR 30 SECONDS: ONLY 1 verse + 1 chorus (NO MORE!)
[Verse 1]
4 lines maximum

[Chorus] 
4 lines maximum
`
    : duration === 60
      ? `
STRUCTURE FOR 60 SECONDS: ONLY 2 verses + 2 choruses (NO bridge, NO extra verses!)
[Verse 1]
4 lines

[Chorus]
2 lines

[Verse 2] 
4 lines

[Chorus]
2 lines
`
      : duration === 90
        ? `
STRUCTURE FOR 90 SECONDS: ONLY 2 verses + 2 choruses + 1 bridge (NO extra verses!)
[Verse 1]
4 lines

[Chorus]
2 lines

[Verse 2]
2 lines

[Bridge]
2 lines

`
        : `
STRUCTURE FOR 120 SECONDS: ONLY 2 verses + 2 choruses 
[Verse 1]
4 lines

[Chorus]
2 lines

[Verse 2]
2 lines

[Bridge]
2 lines

`
}

Do NOT add extra sections. Follow the exact structure above.`,
        },
      ],
      max_tokens: 1000,
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

    // Trim lyrics based on duration to ensure proper length
    const trimmedLyrics = trimLyricsByDuration(processedLyrics, duration);

    return trimmedLyrics;
  } catch (error) {
    console.error("OpenAI lyrics generation error:", error);
    throw new Error("Failed to generate lyrics: " + (error as Error).message);
  }
}

// Function to trim lyrics to appropriate length while maintaining 4-section structure
function trimLyricsByDuration(lyrics: string, duration: number): string {
  // Split lyrics into sections
  const sections = lyrics
    .split(/(\[(?:Verse \d+|Chorus|Bridge|Outro|Intro|Pre-Chorus|Refrain)\])/i)
    .filter((part) => part.trim().length > 0);

  const processedSections: string[] = [];
  let currentHeader = "";

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i].trim();

    if (
      section.match(
        /^\[(?:Verse \d+|Chorus|Bridge|Outro|Intro|Pre-Chorus|Refrain)\]$/i,
      )
    ) {
      currentHeader = section;
    } else if (currentHeader) {
      processedSections.push(currentHeader + "\n" + section);
      currentHeader = "";
    }
  }

  // Define the expected structure based on duration
  let targetStructure: string[];

  if (duration === 30) {
    targetStructure = ["[Verse 1]", "[Chorus]"];
  } else if (duration === 60) {
    targetStructure = ["[Verse 1]", "[Chorus]", "[Verse 2]", "[Chorus]"];
  } else if (duration === 90) {
    targetStructure = ["[Verse 1]", "[Chorus]", "[Verse 2]", "[Bridge]"];
  } else {
    // 120 seconds
    targetStructure = ["[Verse 1]", "[Chorus]", "[Verse 2]", "[Bridge]"];
  }

  // Extract and organize sections according to target structure
  const finalSections: string[] = [];

  for (const target of targetStructure) {
    const matchingSection = processedSections.find((section) =>
      section.toLowerCase().startsWith(target.toLowerCase()),
    );

    if (matchingSection) {
      // Trim each section to 3-4 lines for appropriate length
      const lines = matchingSection
        .split("\n")
        .filter((line) => line.trim().length > 0);
      const header = lines[0];
      const content = lines.slice(1, Math.min(5, lines.length)); // Header + 4 lines max

      finalSections.push([header, ...content].join("\n"));
    } else {
      // If section not found, create a placeholder that matches the target
      finalSections.push(target + "\n(Missing section)");
    }
  }

  return finalSections.join("\n\n");
}

// Helper function to split lyrics into sections dynamically
export function splitLyricsIntoSections(lyrics: string, numberOfSections: number = 4): string[] {
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
    const sectionTypes = ["Verse 1", "Chorus", "Verse 2", "Bridge", "Verse 3", "Outro"];
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
    // Create prompts for the specified number of scenes
    let userContent = `Generate ${numberOfScenes} SHORT and CONCISE image prompts for a music video based on "${songDescription}". Each prompt must be 1-2 sentences maximum.

REQUIREMENTS:
- Each prompt must include a specific CHARACTER ACTION (walking, dancing, singing, looking, pointing, etc.)
- Each prompt must include a CAMERA MOVEMENT (zoom in, zoom out, pan left, pan right, tilt up, tilt down, dolly forward, etc.)
- Keep prompts simple and focused
- First scenes: Start with zoom in from far away
- Last scenes: Character actively singing with dynamic camera work
- Middle scenes: Atmospheric/environmental shots

Example format: "Character dancing on rooftop. Camera pans right while slowly zooming in."`;

    // If we have lyrics sections, add them to the prompt for better scene generation
    if (lyricsSections && lyricsSections.length > 0) {
      userContent += "\n\nBase scenes on these lyrics (keep prompts SHORT):\n";
      
      // Distribute lyrics sections across the number of scenes
      const scenesPerSection = Math.ceil(numberOfScenes / lyricsSections.length);
      
      for (let i = 0; i < lyricsSections.length; i++) {
        const startScene = i * scenesPerSection + 1;
        const endScene = Math.min((i + 1) * scenesPerSection, numberOfScenes);
        let sceneRange = startScene === endScene ? `Scene ${startScene}` : `Scenes ${startScene}-${endScene}`;
        
        let instruction = "";
        if (i === 0) instruction = " - ZOOM IN from distance";
        else if (i === lyricsSections.length - 1) instruction = " - Character actively singing";
        else if (i === Math.floor(lyricsSections.length / 2)) instruction = " - Atmospheric shots";
        
        userContent += `${sceneRange}: ${lyricsSections[i] || "[Instrumental]"}${instruction}\n`;
      }
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            `You are a creative director for music videos. Generate ${numberOfScenes} SHORT and CONCISE scene prompts (1-2 sentences each). Each prompt must include a specific character action and camera movement. Keep them simple and focused for video generation. Respond with JSON in this format: {"prompts": [${Array(numberOfScenes).fill(0).map((_, i) => `"scene ${i + 1} description"`).join(", ")}]}`,
        },
        {
          role: "user",
          content: userContent,
        },
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return result.prompts || [];
  } catch (error) {
    console.error("OpenAI scene generation error:", error);
    throw new Error(
      "Failed to generate scene prompts: " + (error as Error).message,
    );
  }
}
