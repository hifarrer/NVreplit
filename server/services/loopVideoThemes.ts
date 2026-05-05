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
    musicGuide: "synthwave, cyberpunk, futuristic. Instruments: analog synth pads, arpeggiated synths, 808 drums, deep bass, vocoder effects. Tempo: 110-130 BPM.",
    visualGuide: "Neon-lit cityscapes, sci-fi, futuristic, synthwave aesthetic — neon Tokyo, robots, cyborgs, rain-slick streets, holographic ads.",
  },
  {
    id: "desert-western",
    name: "Desert Western / Dieselpunk",
    topics: "desert western, dieselpunk, dusty wastelands, rusted machinery, bounty hunters, sand storms, sepia, steam trains, oil rigs",
    musicGuide: "spaghetti western, dieselpunk, gritty outlaw ballad. Instruments: twangy electric guitar, slide guitar, stomping drums, brass section, harmonica, upright bass. Tempo: 90-110 BPM.",
    visualGuide: "Vast desert wastelands, rusted machinery, steam-powered trains, oil rigs, bounty hunters in trench coats, sand storms and sepia tones.",
  },
  {
    id: "oceanic",
    name: "Oceanic / Biopunk",
    topics: "oceanic, biopunk, underwater civilizations, bioluminescence, coral megacities, dark ocean trenches, bio-engineered suits",
    musicGuide: "deep ambient, biopunk, ethereal underwater. Instruments: waterphone, tribal drums, sub-bass, harp, glass marimba, whale-song textures, reverb-drenched pads. Tempo: 70-95 BPM.",
    visualGuide: "Underwater civilizations, bioluminescent creatures, divers in bio-engineered suits, coral megacities, dark ocean trenches with glowing life.",
  },
  {
    id: "dark-academia",
    name: "Dark Academia / Gothic Victorian",
    topics: "dark academia, gothic Victorian, candle-lit libraries, fog cobblestone, Victorian scholars, ravens, ancient manuscripts, Gothic architecture",
    musicGuide: "neoclassical darkwave, gothic, baroque post-punk. Instruments: string quartet, harpsichord, dramatic piano, cello, pipe organ, minor-key melodies, echoing choir. Tempo: 80-105 BPM.",
    visualGuide: "Candle-lit libraries, fog-covered cobblestone streets, scholars in Victorian coats, ravens, ancient manuscripts, moonlit Gothic architecture.",
  },
  {
    id: "steampunk-victorian",
    name: "Steampunk Victorian Sky",
    topics: "steampunk, Victorian sky, airships, cloud cities, clockwork automatons, top hats and goggles, brass machinery, hot air balloons",
    musicGuide: "orchestral adventure, steampunk, triumphant. Instruments: brass fanfares, ticking clock percussion, snare rolls, French horn, accordion, strings, mechanical SFX layered in rhythm. Tempo: 120-140 BPM.",
    visualGuide: "Airships over cloud cities, clockwork automatons, top hats and goggles, brass machinery, hot air balloons, stylized Victorian maps.",
  },
  {
    id: "retrowave-lofi",
    name: "Retrowave / Lo-Fi Pixel",
    topics: "retrowave, lo-fi, pixel art, retro arcade, CRT monitors, 8-bit, nostalgia, bedroom studios",
    musicGuide: "lo-fi hip-hop, chiptune, retrowave, nostalgic. Instruments: vinyl crackle, dusty SP-404 drums, 8-bit bleeps, jazzy Rhodes piano, detuned synth bass, fingerpicked guitar. Tempo: 75-95 BPM.",
    visualGuide: "Pixel art cityscapes, retro arcade characters, CRT monitors, 8-bit animation, nostalgia-soaked bedroom studios.",
  },
  {
    id: "dark-fantasy",
    name: "Dark Fantasy / Blood Magic",
    topics: "dark fantasy, blood magic, warriors, dark castles, demonic summonings, anti-heroes, crimson moons, crumbling empires",
    musicGuide: "epic orchestral metal, dark fantasy, cinematic aggression. Instruments: double-kick drums, distorted electric guitar, symphonic strings, war horns, epic choir, thundering toms, bass drops. Tempo: 130-160 BPM.",
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
