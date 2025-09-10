// Profanity filter utility
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
    "rape"
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
      return 'Please remove profanity from your lyrics.';
    case 'sexual':
      return 'Please remove sexual content from your lyrics.';
    case 'harassment':
      return 'Please remove harassment content from your lyrics.';
    case 'hate_speech':
      return 'Please remove hate speech from your lyrics.';
    case 'extreme_prohibited':
      return 'This content is strictly prohibited. Please revise your lyrics.';
    default:
      return 'Please remove inappropriate content from your lyrics.';
  }
}