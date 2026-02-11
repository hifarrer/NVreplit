// Server-side profanity filter utility
const PROFANITY_DATA = {
  "profanity": [
    "fuck",
    "shit",
    "bitch",
    "asshole",
    "bastard",
    "damn",
    "dick",
    "piss",
    "cunt",
    "motherfucker",
    "whore",
    "slut"
  ],
  "sexual": [
    "porn",
    "xxx",
    "blowjob",
    "handjob",
    "dildo",
    "clit",
    "pussy",
    "cock",
    "cum",
    "semen",
    "anal",
    "vagina",
    "penis",
    "masturbate",
    "orgasm",
    "yourpenis",
    "yourpussy",
    "yourboobs",
    "yourtits",
    "penis",
    "dick",
    "boner",
    "rape",
    "nude",
    "naked",
    "nudity",
    "bare",
    "topless",
    "bottomless",
    "explicit",
    "erotic",
    "sex",
    "sexual",
    "sexy",
    "seductive",
    "provocative",
    "lingerie",
    "underwear",
    "bra",
    "panties",
    "thong",
    "bikini",
    "swimsuit",
    "undressed",
    "undressing",
    "stripping",
    "strip",
    "nipple",
    "nipples",
    "breast",
    "breasts",
    "boobs",
    "tits",
    "ass",
    "butt",
    "buttocks",
    "genital",
    "genitals",
    "pubic",
    "arousal",
    "arous",
    "horny",
    "lust",
    "desire",
    "fetish",
    "bdsm",
    "kink",
    "kinky",
    "bondage",
    "domination",
    "submissive",
    "slave",
    "master",
    "mistress",
    "orgy",
    "threesome",
    "gangbang",
    "hardcore",
    "softcore",
    "hentai",
    "ecchi",
    "yuri",
    "yaoi",
    "nsfw",
    "adult content",
    "18+",
    "xxx content"
  ],
  "harassment": [
    "nazi",
    "kill yourself",
    "jew"
  ],
  "hate_speech": [
    "nigga",
    "nigger",
    "negro"
  ],
  "extreme_prohibited": [
    "pedophile",
    "pedo",
    "incest",
    "bestiality",
    "zoophilia",
    "necro",
    "necrophilia",
    "child porn",
    "molest",
    "grooming"
  ]
};

export interface ProfanityCheckResult {
  isClean: boolean;
  detectedWords: string[];
  category: string | null;
}

export function checkProfanity(text: string): ProfanityCheckResult {
  if (!text) {
    return { isClean: true, detectedWords: [], category: null };
  }

  const normalizedText = text.toLowerCase();
  const detectedWords: string[] = [];
  let category: string | null = null;

  // Check each category
  for (const [categoryName, words] of Object.entries(PROFANITY_DATA)) {
    for (const word of words) {
      // Check for exact word matches (with word boundaries)
      const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(normalizedText)) {
        detectedWords.push(word);
        if (!category) {
          category = categoryName;
        }
      }
    }
  }

  return {
    isClean: detectedWords.length === 0,
    detectedWords,
    category
  };
}

export function getCategoryMessage(category: string): string {
  switch (category) {
    case 'profanity':
      return 'Content contains profanity.';
    case 'sexual':
      return 'Content contains sexual content.';
    case 'harassment':
      return 'Content contains harassment.';
    case 'hate_speech':
      return 'Content contains hate speech.';
    case 'extreme_prohibited':
      return 'Content is strictly prohibited.';
    default:
      return 'Content contains inappropriate material.';
  }
}

/**
 * Validates character generation prompts for inappropriate content
 * @param prompt - The main prompt text
 * @param promptEnhancer - Optional prompt enhancer text
 * @throws Error if inappropriate content is detected
 */
export function validateCharacterGenerationPrompt(
  prompt: string,
  promptEnhancer?: string | null
): void {
  // Combine prompt and enhancer for checking
  const fullText = promptEnhancer 
    ? `${prompt} ${promptEnhancer}` 
    : prompt;

  const result = checkProfanity(fullText);
  
  if (!result.isClean) {
    const message = getCategoryMessage(result.category || 'sexual');
    throw new Error(
      `Inappropriate content detected: ${message} Please use appropriate prompts for character generation.`
    );
  }
}