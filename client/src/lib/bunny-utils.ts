const BUNNY_URL_PATTERN = /\.b-cdn\.net\/|storage\.bunnycdn\.com/;

export function isBunnyUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return BUNNY_URL_PATTERN.test(url);
}
