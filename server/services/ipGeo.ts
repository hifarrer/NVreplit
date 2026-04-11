const LOOKUP_TIMEOUT_MS = 3000;

function parseIpv4Octets(ip: string): [number, number, number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.trim());
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const c = Number(m[3]);
  const d = Number(m[4]);
  if ([a, b, c, d].some((n) => n > 255 || n < 0)) return null;
  return [a, b, c, d];
}

/** Returns true if the address is suitable for a public geo lookup (not loopback/private/link-local). */
export function isLikelyPublicIp(ip: string | null | undefined): boolean {
  if (ip == null || typeof ip !== "string") return false;
  const trimmed = ip.trim();
  if (!trimmed) return false;

  if (trimmed === "::1" || trimmed === "0:0:0:0:0:0:0:1") return false;
  if (trimmed.toLowerCase().startsWith("fe80:")) return false;
  if (trimmed.toLowerCase() === "::ffff:127.0.0.1") return false;

  const v4 = parseIpv4Octets(trimmed);
  if (v4) {
    const [a, b] = v4;
    if (a === 10) return false;
    if (a === 127) return false;
    if (a === 0) return false;
    if (a === 169 && b === 254) return false;
    if (a === 192 && b === 168) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    return true;
  }

  if (trimmed.includes(":")) {
    return true;
  }

  return false;
}

type IpApiFields = {
  status?: string;
  country?: string;
  message?: string;
};

/**
 * Resolves country name from IPv4/IPv6 via ip-api.com (free JSON endpoint).
 * Returns null on private IP, timeout, or API failure — callers should not throw.
 */
export async function lookupCountryFromIp(ip: string): Promise<string | null> {
  if (!isLikelyPublicIp(ip)) return null;

  const encoded = encodeURIComponent(ip.trim());
  const url = `http://ip-api.com/json/${encoded}?fields=status,country,message`;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), LOOKUP_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) {
      console.warn(`[ipGeo] ip-api HTTP ${res.status} for ${ip}`);
      return null;
    }
    const data = (await res.json()) as IpApiFields;
    if (data.status === "success" && typeof data.country === "string") {
      const country = data.country.trim();
      return country.length > 0 ? country : null;
    }
    if (data.message) {
      console.warn(`[ipGeo] ip-api: ${data.message} (${ip})`);
    }
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[ipGeo] lookup failed for ${ip}: ${msg}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
