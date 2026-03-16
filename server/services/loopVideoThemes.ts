/**
 * Theme registry for the auto-generate-loop-video endpoint.
 * Each theme defines topics, music guide, and visual guide for prompt generation.
 */

export interface LoopVideoTheme {
  id: string;
  name: string;
  topics: string;
  musicGuide: string;
  visualGuide: string;
}

export const LOOP_VIDEO_THEMES: LoopVideoTheme[] = [
  {
    id: "cyberpunk",
    name: "Cyberpunk",
    topics: "cyberpunk, sci-fi, futuristic, synthwave, retrowave, robots, cyborgs, neon Tokyo",
    musicGuide: "Style as synthwave, retrowave, and/or electronic; mood and topic (cyberpunk, sci-fi, futuristic, robots, cyborgs, neon Tokyo).",
    visualGuide: "Neon-lit cityscapes, sci-fi, futuristic, synthwave aesthetic — neon Tokyo, robots, cyborgs, rain-slick streets, holographic ads.",
  },
  {
    id: "desert-western",
    name: "Desert Western / Dieselpunk",
    topics: "desert western, dieselpunk, dusty wastelands, rusted machinery, bounty hunters, sand storms, sepia, steam trains, oil rigs",
    musicGuide: "Dusty spaghetti western guitars mixed with diesel-era big band brass and gritty industrial percussion.",
    visualGuide: "Vast desert wastelands, rusted machinery, steam-powered trains, oil rigs, bounty hunters in trench coats, sand storms and sepia tones.",
  },
  {
    id: "oceanic",
    name: "Oceanic / Biopunk",
    topics: "oceanic, biopunk, underwater civilizations, bioluminescence, coral megacities, dark ocean trenches, bio-engineered suits",
    musicGuide: "Deep ambient drone layered with whale songs, tribal percussion, and waterphone textures — eerie and vast.",
    visualGuide: "Underwater civilizations, bioluminescent creatures, divers in bio-engineered suits, coral megacities, dark ocean trenches with glowing life.",
  },
  {
    id: "dark-academia",
    name: "Dark Academia / Gothic Victorian",
    topics: "dark academia, gothic Victorian, candle-lit libraries, fog cobblestone, Victorian scholars, ravens, ancient manuscripts, Gothic architecture",
    musicGuide: "Neoclassical dark wave — string quartets, harpsichord, dramatic piano, minor keys. Baroque meets post-punk.",
    visualGuide: "Candle-lit libraries, fog-covered cobblestone streets, scholars in Victorian coats, ravens, ancient manuscripts, moonlit Gothic architecture.",
  },
  {
    id: "steampunk-victorian",
    name: "Steampunk Victorian Sky",
    topics: "steampunk, Victorian sky, airships, cloud cities, clockwork automatons, top hats and goggles, brass machinery, hot air balloons",
    musicGuide: "Orchestral adventure meets clockwork electronica — brass instruments, ticking rhythms, triumphant horn fanfares.",
    visualGuide: "Airships over cloud cities, clockwork automatons, top hats and goggles, brass machinery, hot air balloons, stylized Victorian maps.",
  },
  {
    id: "retrowave-lofi",
    name: "Retrowave / Lo-Fi Pixel",
    topics: "retrowave, lo-fi, pixel art, retro arcade, CRT monitors, 8-bit, nostalgia, bedroom studios",
    musicGuide: "Chiptune-infused lo-fi hip hop — GameBoy bleeps and bloops over jazzy chords and dusty beats.",
    visualGuide: "Pixel art cityscapes, retro arcade characters, CRT monitors, 8-bit animation, nostalgia-soaked bedroom studios.",
  },
  {
    id: "dark-fantasy",
    name: "Dark Fantasy / Blood Magic",
    topics: "dark fantasy, blood magic, warriors, dark castles, demonic summonings, anti-heroes, crimson moons, crumbling empires",
    musicGuide: "Epic orchestral metal — thundering drums, electric guitars harmonizing with choirs, intense and cinematic.",
    visualGuide: "Warriors wielding blood-red magic, dark castles, demonic summonings, brooding anti-heroes, crimson moons, crumbling empires.",
  },
];

/**
 * Normalize a style string from the URL: lowercase, spaces to hyphens.
 */
export function normalizeStyleId(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-");
}

/**
 * Get a theme by its id (use normalized id for comparison).
 */
export function getThemeById(id: string): LoopVideoTheme | undefined {
  const normalized = normalizeStyleId(id);
  return LOOP_VIDEO_THEMES.find((t) => t.id === normalized);
}

/**
 * Pick a random theme from the registry.
 */
export function pickRandomTheme(): LoopVideoTheme {
  const index = Math.floor(Math.random() * LOOP_VIDEO_THEMES.length);
  return LOOP_VIDEO_THEMES[index];
}

/**
 * Resolve the theme to use: by requested style param or random.
 */
export function resolveLoopVideoTheme(requestedStyle: string | undefined): LoopVideoTheme {
  if (requestedStyle != null && String(requestedStyle).trim() !== "") {
    const theme = getThemeById(String(requestedStyle));
    if (theme) return theme;
  }
  return pickRandomTheme();
}
