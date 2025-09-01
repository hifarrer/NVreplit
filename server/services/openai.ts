import OpenAI from "openai";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({
  apiKey:
    process.env.OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY_ENV_VAR ||
    "default_key",
});

export async function generateLyrics(songDescription: string, duration: number = 60): Promise<string> {
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

CRITICAL: The song is EXACTLY ${duration} seconds long. You MUST follow these structures EXACTLY:

${duration === 30 ? `
STRUCTURE FOR 30 SECONDS: ONLY 1 verse + 1 chorus (NO MORE!)
[Verse 1]
4 lines maximum

[Chorus] 
4 lines maximum
` : duration === 60 ? `
STRUCTURE FOR 60 SECONDS: ONLY 2 verses + 2 choruses (NO bridge, NO extra verses!)
[Verse 1]
4 lines

[Chorus]
4 lines

[Verse 2] 
4 lines

[Chorus]
4 lines
` : duration === 90 ? `
STRUCTURE FOR 90 SECONDS: ONLY 2 verses + 2 choruses + 1 bridge (NO extra verses!)
[Verse 1]
4 lines

[Chorus]
4 lines

[Verse 2]
4 lines

[Chorus]
4 lines

[Bridge]
4 lines
` : `
STRUCTURE FOR 120 SECONDS: ONLY 3 verses + 3 choruses + 1 bridge
[Verse 1]
4 lines

[Chorus]
4 lines

[Verse 2]
4 lines

[Chorus]
4 lines

[Bridge]
4 lines

[Verse 3]
4 lines

[Chorus]
4 lines
`}

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
  const sections = lyrics.split(/(\[(?:Verse \d+|Chorus|Bridge|Outro|Intro|Pre-Chorus|Refrain)\])/i)
    .filter(part => part.trim().length > 0);

  const processedSections: string[] = [];
  let currentHeader = '';

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i].trim();
    
    if (section.match(/^\[(?:Verse \d+|Chorus|Bridge|Outro|Intro|Pre-Chorus|Refrain)\]$/i)) {
      currentHeader = section;
    } else if (currentHeader) {
      processedSections.push(currentHeader + '\n' + section);
      currentHeader = '';
    }
  }

  // Define the expected structure based on duration
  let targetStructure: string[];
  
  if (duration === 30) {
    targetStructure = ['[Verse 1]', '[Chorus]'];
  } else if (duration === 60) {
    targetStructure = ['[Verse 1]', '[Chorus]', '[Verse 2]', '[Chorus]'];
  } else if (duration === 90) {
    targetStructure = ['[Verse 1]', '[Chorus]', '[Verse 2]', '[Bridge]'];
  } else { // 120 seconds
    targetStructure = ['[Verse 1]', '[Chorus]', '[Verse 2]', '[Bridge]'];
  }

  // Extract and organize sections according to target structure
  const finalSections: string[] = [];
  
  for (const target of targetStructure) {
    const matchingSection = processedSections.find(section => 
      section.toLowerCase().startsWith(target.toLowerCase())
    );
    
    if (matchingSection) {
      // Trim each section to 3-4 lines for appropriate length
      const lines = matchingSection.split('\n').filter(line => line.trim().length > 0);
      const header = lines[0];
      const content = lines.slice(1, Math.min(5, lines.length)); // Header + 4 lines max
      
      finalSections.push([header, ...content].join('\n'));
    } else {
      // If section not found, create a placeholder that matches the target
      finalSections.push(target + '\n(Missing section)');
    }
  }

  return finalSections.join('\n\n');
}

// Helper function to split lyrics into 4 sections
export function splitLyricsIntoSections(lyrics: string): string[] {
  // Split by section headers to get individual sections
  const parts = lyrics.split(/(\[(?:Verse \d+|Chorus|Bridge|Outro|Intro|Pre-Chorus|Refrain)\])/i)
    .filter(part => part.trim().length > 0);

  const sections: string[] = [];
  let currentHeader = '';

  // Combine headers with their content
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    
    if (part.match(/^\[(?:Verse \d+|Chorus|Bridge|Outro|Intro|Pre-Chorus|Refrain)\]$/i)) {
      currentHeader = part;
    } else if (currentHeader) {
      sections.push(currentHeader + '\n' + part);
      currentHeader = '';
    }
  }

  // If we have exactly 4 sections, return them
  if (sections.length === 4) {
    return sections;
  }

  // If we have fewer than 4 sections, pad with the last section repeated
  if (sections.length < 4) {
    const lastSection = sections[sections.length - 1] || '[Verse 1]\nGenerated content';
    while (sections.length < 4) {
      sections.push(lastSection);
    }
    return sections;
  }

  // If we have more than 4 sections, take the first 4
  if (sections.length > 4) {
    return sections.slice(0, 4);
  }

  // Fallback: split lyrics into 4 equal parts by lines
  const lines = lyrics.split('\n').filter(line => line.trim().length > 0);
  if (lines.length === 0) {
    return ['[Verse 1]\nGenerated content', '[Chorus]\nGenerated content', '[Verse 2]\nGenerated content', '[Bridge]\nGenerated content'];
  }

  const linesPerSection = Math.ceil(lines.length / 4);
  
  return [
    lines.slice(0, linesPerSection).join('\n'),
    lines.slice(linesPerSection, linesPerSection * 2).join('\n'),
    lines.slice(linesPerSection * 2, linesPerSection * 3).join('\n'),
    lines.slice(linesPerSection * 3).join('\n')
  ];
}

export async function generateScenePrompts(
  songDescription: string,
  lyricsSections?: string[]
): Promise<string[]> {
  try {
    // Create prompts for each pair of scenes (8 total scenes, 4 sections)
    let userContent = `Generate 8 image prompts to generate 8 images that will be used as frames for a music video based on the following prompt "${songDescription}". Be creative generating completely different scenes with the same character, be detailed describing everything in the scene as well as the character clothes and expression. Also include camera movements like zoom in, zoom out, pan left, pan right, tilt up, tilt down, etc. as well as visual effects.

IMPORTANT DIRECTING REQUIREMENTS:
- Scenes 1-2 (part_1a & part_1b): Must start with a far away shot of the character, slowly zooming in. Begin with an establishing wide shot showing the character in their environment, then transition to a closer shot.
- Scenes 7-8 (part_3b & part_4b): Must show the character actively singing. Be creative with the setting - could be at a bar, concert venue, recording studio, or performance space. Include props like microphones, headsets, or stage equipment. Show expressive singing poses and gestures.
- Scenes 5-6 (part_3a & part_4a): These are instrumental sections, so focus on atmospheric shots, environment details, or artistic visual elements without showing singing.`;
    
    // If we have lyrics sections, add them to the prompt for better scene generation
    if (lyricsSections && lyricsSections.length > 0) {
      userContent += "\n\nThe scenes should be related to these lyrics sections:\n";
      userContent += "Scenes 1-2 (part_1a & part_1b) should relate to: " + (lyricsSections[0] || "[Instrumental]") + " - START WITH FAR AWAY SHOT ZOOMING IN\n";
      userContent += "Scenes 3-4 (part_2a & part_2b) should relate to: " + (lyricsSections[1] || "[Instrumental]") + "\n";
      userContent += "Scenes 5-6 (part_3a & part_3b) should relate to: " + (lyricsSections[2] || "[Instrumental]") + " - INSTRUMENTAL SECTIONS, NO SINGING\n";
      userContent += "Scenes 7-8 (part_4a & part_4b) should relate to: " + (lyricsSections[3] || "[Instrumental]") + " - SHOW CHARACTER SINGING ACTIVELY\n";
      userContent += "\nMake sure each pair of scenes relates to the corresponding lyrics section while maintaining visual continuity and following the specific directing requirements above.";
    }
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            'You are a creative director for music videos. Generate 8 detailed scene prompts that would make compelling visuals for a music video. Each prompt should describe a complete scene with the character, setting, mood, and visual elements and have a related sequence. Respond with JSON in this format: {"prompts": ["scene 1 description", "scene 2 description", "scene 3 description", "scene 4 description", "scene 5 description", "scene 6 description", "scene 7 description", "scene 8 description"]}',
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
