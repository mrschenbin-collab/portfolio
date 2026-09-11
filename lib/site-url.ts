export function getSiteUrl(): string {
  const configured = process.env.SITE_URL;
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
    } catch {
      // Fall through to a safe local default.
    }
  }
  return "http://localhost:3000";
}

export function previewMetadata(): Record<string, string> | undefined {
  return process.env.NODE_ENV === "production" ? undefined : { "codex-preview": "development" };
}
