export const MAX_ORIGIN_URL = 8192;
export const MAX_ORIGIN_HOST = 253;
export const MAX_ASSET_ID = 128;

export interface SavedDownloadSource {
  website: string;
  url: string;
  assetId: string;
}

export interface DownloadOrigin {
  metaKey: string;
  urls: string[];
  saved: SavedDownloadSource | null;
}

export function sourceWebUrl(value: string): URL | null {
  const text = value.trim();
  if (text.length > MAX_ORIGIN_URL || !/^https?:\/\//i.test(text)) return null;
  try {
    const url = new URL(text);
    return url.hostname && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

export function sourceWebsite(value: string): URL | null {
  const text = value.trim();
  const url = sourceWebUrl(
    /^https?:\/\//i.test(text) ? text : `https://${text}`,
  );
  if (!url || url.pathname !== "/" || url.search || url.hash || url.port)
    return null;
  return url;
}

function providerHost(host: string): string {
  const bare = host.replace(/^www\./, "");
  if (bare === "images.pexels.com" || bare === "videos.pexels.com")
    return "pexels.com";
  if (bare === "cdn.pixabay.com") return "pixabay.com";
  if (bare === "images.unsplash.com" || bare === "plus.unsplash.com")
    return "unsplash.com";
  if (bare === "upload.wikimedia.org") return "commons.wikimedia.org";
  if (bare === "img.freepik.com") return "freepik.com";
  return bare;
}

export function recordedSourceWebsite(urls: readonly string[]): string {
  const hosts = urls.flatMap((value) => {
    const url = sourceWebUrl(value);
    return url ? [providerHost(url.hostname)] : [];
  });
  const providers = [
    "pexels.com",
    "pixabay.com",
    "unsplash.com",
    "commons.wikimedia.org",
    "freepik.com",
    "magnific.com",
  ];
  return (
    hosts.find((host) => providers.includes(host)) ?? hosts[1] ?? hosts[0] ?? ""
  );
}

/** Only generate candidates from a user-entered ID and an exact provider host. */
export function sourcePageById(
  website: string,
  input: string,
  kind: string,
): string | null {
  const host = providerHost(sourceWebsite(website)?.hostname ?? "");
  const id = input.trim();
  if (!id || id.length > MAX_ASSET_ID) return null;
  if (host === "unsplash.com" && kind === "image" && /^[\w-]+$/.test(id)) {
    return `https://unsplash.com/photos/${id}`;
  }
  if (!/^[1-9]\d{0,17}$/.test(id)) return null;
  if (host === "pexels.com" && kind === "video")
    return `https://www.pexels.com/video/${id}/`;
  if (host === "commons.wikimedia.org")
    return `https://commons.wikimedia.org/wiki/Special:Redirect/page/${id}`;
  return null;
}

/** A user can still search a provider when its public ID shortcut is unknown. */
export function searchSourceId(website: string, input: string): string | null {
  const site = sourceWebsite(website);
  const id = input.trim();
  if (!site || !id || id.length > MAX_ASSET_ID) return null;
  const query = new URLSearchParams({
    q: `site:${providerHost(site.hostname)} "${id}"`,
  });
  return `https://duckduckgo.com/?${query}`;
}
