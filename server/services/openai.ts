import OpenAI from "openai";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "default_key"
});

export async function generateLyrics(songDescription: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Using gpt-4o instead of gpt-5 due to organization verification requirements
      messages: [
        {
          role: "system",
          content: "You are a creative songwriter. Generate meaningful lyrics based on the provided description. Include verses, chorus, and bridge sections as appropriate."
        },
        {
          role: "user",
          content: `Generate lyrics for a song about: ${songDescription}`
        }
      ],
      max_tokens: 1000,
    });

    return response.choices[0].message.content || "";
  } catch (error) {
    console.error("OpenAI lyrics generation error:", error);
    throw new Error("Failed to generate lyrics: " + (error as Error).message);
  }
}

export async function generateScenePrompts(songDescription: string): Promise<string[]> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Using gpt-4o instead of gpt-5 due to organization verification requirements
      messages: [
        {
          role: "system",
          content: "You are a creative director for music videos. Generate 4 detailed scene prompts that would make compelling visuals for a music video. Each prompt should describe a complete scene with the character, setting, mood, and visual elements. Respond with JSON in this format: {\"prompts\": [\"scene 1 description\", \"scene 2 description\", \"scene 3 description\", \"scene 4 description\"]}"
        },
        {
          role: "user",
          content: `Generate 4 image prompts to generate 4 images that will be used as frames for a music video based on the following prompt "${songDescription}". Be creative generating completely different scenes with the same character, be detailed describing everything in the scene as well as the character clothes and expression.`
        }
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return result.prompts || [];
  } catch (error) {
    console.error("OpenAI scene generation error:", error);
    throw new Error("Failed to generate scene prompts: " + (error as Error).message);
  }
}
