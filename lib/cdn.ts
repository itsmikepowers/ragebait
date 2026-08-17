/** Builds a public CDN URL from a stored R2 object path. */
export function buildCdnUrl(path: string | null | undefined): string | null {
  if (!path) {
    return null;
  }

  const baseUrl = process.env.NEXT_PUBLIC_CDN_URL;
  if (!baseUrl) {
    return null;
  }

  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}
