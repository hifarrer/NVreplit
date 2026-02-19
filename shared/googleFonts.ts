// Popular Google Fonts for video captions
// These are commonly used fonts that work well for video subtitles
export const popularGoogleFonts = [
  { value: "Inter", label: "Inter", importName: "Inter" },
  { value: "Roboto", label: "Roboto", importName: "Roboto" },
  { value: "Open Sans", label: "Open Sans", importName: "OpenSans" },
  { value: "Montserrat", label: "Montserrat", importName: "Montserrat" },
  { value: "Poppins", label: "Poppins", importName: "Poppins" },
  { value: "Lato", label: "Lato", importName: "Lato" },
  { value: "Raleway", label: "Raleway", importName: "Raleway" },
  { value: "Oswald", label: "Oswald", importName: "Oswald" },
  { value: "Playfair Display", label: "Playfair Display", importName: "PlayfairDisplay" },
  { value: "Bebas Neue", label: "Bebas Neue", importName: "BebasNeue" },
  { value: "Titan One", label: "Titan One", importName: "TitanOne" },
  { value: "Bangers", label: "Bangers", importName: "Bangers" },
  { value: "Righteous", label: "Righteous", importName: "Righteous" },
  { value: "Fredoka", label: "Fredoka", importName: "Fredoka" },
  { value: "Bungee", label: "Bungee", importName: "Bungee" },
  { value: "Lilita One", label: "Lilita One", importName: "LilitaOne" },
  { value: "Rubik", label: "Rubik", importName: "Rubik" },
  { value: "Nunito", label: "Nunito", importName: "Nunito" },
  { value: "Source Sans 3", label: "Source Sans 3", importName: "SourceSans3" },
  { value: "Ubuntu", label: "Ubuntu", importName: "Ubuntu" },
] as const;

export type GoogleFont = (typeof popularGoogleFonts)[number]["value"];

export const defaultGoogleFont: GoogleFont = "Inter";

export const isGoogleFont = (value: unknown): value is GoogleFont => {
  return typeof value === "string" && popularGoogleFonts.some((font) => font.value === value);
};

// Helper to get import name from font value
export const getFontImportName = (fontValue: GoogleFont): string => {
  const font = popularGoogleFonts.find((f) => f.value === fontValue);
  return font?.importName || "Inter";
};
