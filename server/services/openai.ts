import OpenAI from "openai";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({
  apiKey:
    process.env.OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY_ENV_VAR ||
    "default_key",
});

export async function generateLyrics(songDescription: string): Promise<string> {
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

Example format:
[Verse 1]
Your lyrics here...

[Chorus]
Your chorus here...

[Verse 2]
More lyrics here...

[Bridge]
Bridge lyrics here...`,
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

    return processedLyrics;
  } catch (error) {
    console.error("OpenAI lyrics generation error:", error);
    throw new Error("Failed to generate lyrics: " + (error as Error).message);
  }
}

// Helper function to split lyrics into 4 sections
export function splitLyricsIntoSections(lyrics: string): string[] {
  const sections: string[] = [];
  
  // Common section patterns
  const sectionPatterns = [
    /\[Verse 1\]([\s\S]*?)(?=\[|$)/i,
    /\[Chorus\]([\s\S]*?)(?=\[|$)/i,
    /\[Verse 2\]([\s\S]*?)(?=\[|$)/i,
    /\[Bridge\]([\s\S]*?)(?=\[|$)/i,
  ];
  
  // Try to extract the 4 main sections
  for (const pattern of sectionPatterns) {
    const match = lyrics.match(pattern);
    if (match && match[1]) {
      sections.push(match[0].trim()); // Include the section header
    }
  }
  
  // If we don't have exactly 4 sections, fall back to splitting by any section headers
  if (sections.length !== 4) {
    const allSections = lyrics.split(/\[(?:Verse \d+|Chorus|Bridge|Outro|Intro|Pre-Chorus|Refrain)\]/i)
      .filter(section => section.trim().length > 0)
      .slice(0, 4);
    
    // If still not enough sections, split the lyrics into 4 equal parts
    if (allSections.length < 4) {
      const lines = lyrics.split('\n').filter(line => line.trim().length > 0);
      const linesPerSection = Math.ceil(lines.length / 4);
      
      return [
        lines.slice(0, linesPerSection).join('\n'),
        lines.slice(linesPerSection, linesPerSection * 2).join('\n'),
        lines.slice(linesPerSection * 2, linesPerSection * 3).join('\n'),
        lines.slice(linesPerSection * 3).join('\n')
      ];
    }
    
    return allSections;
  }
  
  return sections;
}

export async function generateScenePrompts(
  songDescription: string,
  lyricsSections?: string[]
): Promise<string[]> {
  try {
    // Create prompts for each pair of scenes (8 total scenes, 4 sections)
    let userContent = `Generate 8 image prompts to generate 8 images that will be used as frames for a music video based on the following prompt "${songDescription}". Be creative generating completely different scenes with the same character, be detailed describing everything in the scene as well as the character clothes and expression. Also include camera movements like zoom in, zoom out, pan left, pan right, tilt up, tilt down, etc. as well as visual effects.`;
    
    // If we have lyrics sections, add them to the prompt for better scene generation
    if (lyricsSections && lyricsSections.length > 0) {
      userContent += "\n\nThe scenes should be related to these lyrics sections:\n";
      userContent += "Scenes 1-2 (part_1a & part_1b) should relate to: " + (lyricsSections[0] || "[Instrumental]") + "\n";
      userContent += "Scenes 3-4 (part_2a & part_2b) should relate to: " + (lyricsSections[1] || "[Instrumental]") + "\n";
      userContent += "Scenes 5-6 (part_3a & part_3b) should relate to: " + (lyricsSections[2] || "[Instrumental]") + "\n";
      userContent += "Scenes 7-8 (part_4a & part_4b) should relate to: " + (lyricsSections[3] || "[Instrumental]") + "\n";
      userContent += "\nMake sure each pair of scenes relates to the corresponding lyrics section while maintaining visual continuity.";
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
