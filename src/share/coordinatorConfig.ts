/** Public signaling endpoint configuration shared by the app and build checks. */
export const DEFAULT_COORDINATOR_BASE =
  "https://bonjou-coordinator.bonjou-cloudflare-coordinator.workers.dev";

export function resolveCoordinatorBase(configured?: string): string {
  const value = configured?.trim() || DEFAULT_COORDINATOR_BASE;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("VITE_COORDINATOR_URL must be an absolute HTTP(S) URL");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    /[?#]/.test(value)
  )
    throw new Error(
      "VITE_COORDINATOR_URL must be an HTTP(S) URL without credentials, a query, or a fragment",
    );
  return url.href.replace(/\/+$/, "");
}
