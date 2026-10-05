/** Public metadata shared by the static build and client-side navigation. */
export const SITE_URL = "https://bonjou.vercel.app/";
export const PAGE_TITLE = "bonjou-web";
export const HOME_DESCRIPTION =
  "Share files, folders, and messages directly between devices on the same Wi-Fi. No account or installation needed. Try Bonjou's browser sharing demo.";
export const APP_DESCRIPTION =
  "Open Bonjou to share messages, files, and folders directly with people on your local network. Recipients approve files before the transfer starts.";

export function isApplicationUrl(pathname: string, search = ""): boolean {
  return (
    /^\/(app|share)(\/|$)/.test(pathname) ||
    pathname.startsWith("/r/") ||
    pathname === "/app-shell.html" ||
    Boolean(new URLSearchParams(search).get("r"))
  );
}

const siteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: PAGE_TITLE,
  alternateName: "Bonjou",
  url: SITE_URL,
  description: HOME_DESCRIPTION,
  inLanguage: "en",
};

function metadata(application: boolean) {
  const description = application ? APP_DESCRIPTION : HOME_DESCRIPTION;
  return {
    description,
    robots: application
      ? "noindex, follow"
      : "index, follow, max-image-preview:large",
    "og:type": "website",
    "og:site_name": PAGE_TITLE,
    "og:title": PAGE_TITLE,
    "og:description": description,
    // Never include room codes, user names, or session data in public metadata.
    "og:url": application ? `${SITE_URL}app` : SITE_URL,
    "og:image": `${SITE_URL}brand/bonjou-avatar.png`,
    "og:image:type": "image/png",
    "og:image:width": "512",
    "og:image:height": "512",
    "og:image:alt": "Bonjou logo",
    "twitter:card": "summary",
    "twitter:title": PAGE_TITLE,
    "twitter:description": description,
    "twitter:image": `${SITE_URL}brand/bonjou-avatar.png`,
    "twitter:image:alt": "Bonjou logo",
  };
}

function escapeAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

export function renderMetadata(application: boolean): string {
  const tags = Object.entries(metadata(application)).map(([key, value]) =>
    `<meta ${key.startsWith("og:") ? "property" : "name"}="${key}" content="${escapeAttribute(value)}" />`,
  );
  if (!application) {
    tags.push(`<link rel="canonical" href="${SITE_URL}" />`);
    const schema = JSON.stringify(siteSchema).replace(/</g, "\\u003c");
    tags.push(
      `<script id="bonjou-site-schema" type="application/ld+json">${schema}</script>`,
    );
  }
  return `<!--seo-metadata-start-->\n${tags.join("\n")}\n<!--seo-metadata-end-->`;
}

/** Keep the head honest when the preserved workspace opens or returns home. */
export function applyMetadata(application: boolean): void {
  document.title = PAGE_TITLE;
  for (const [key, value] of Object.entries(metadata(application))) {
    const attribute = key.startsWith("og:") ? "property" : "name";
    let tag = document.head.querySelector<HTMLMetaElement>(
      `meta[${attribute}="${key}"]`,
    );
    if (!tag) {
      tag = document.createElement("meta");
      tag.setAttribute(attribute, key);
      document.head.appendChild(tag);
    }
    tag.content = value;
  }
  let canonical = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]',
  );
  let schema = document.getElementById("bonjou-site-schema");
  if (application) {
    canonical?.remove();
    schema?.remove();
  } else {
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = SITE_URL;
    if (!schema) {
      schema = document.createElement("script");
      schema.id = "bonjou-site-schema";
      schema.setAttribute("type", "application/ld+json");
      document.head.appendChild(schema);
    }
    schema.textContent = JSON.stringify(siteSchema);
  }
}
