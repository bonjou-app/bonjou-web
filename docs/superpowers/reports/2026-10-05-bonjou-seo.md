# Bonjou SEO implementation

Google Chrome was used to search Google for “Google Search Central SEO starter guide JavaScript SEO title links” and read the primary documentation. The requested tab title is exactly `bonjou-web` on the homepage and sharing routes.

## Practices applied

- Build-time rendering uses the existing Landing component, so the public response includes the real product copy, navigation, original artwork, and all five FAQ answers. The current theme-aware React client still mounts normally; no production SSR server or dependency was added.
- The introductory paragraph explicitly describes local file, folder and message sharing. Four primary workspace CTAs are real links with normal modified/new-tab behavior and preserved session-aware navigation for plain clicks.
- The homepage has an absolute canonical URL, a useful description, WebSite JSON-LD with its short name and Bonjou alternate name, and Open Graph/Twitter previews using the approved logo. Workspace metadata never includes room codes, names or session values.
- A separate application shell and HTTP/meta `noindex` cover `/app`, `/share`, `/r/{code}`, the shell itself and legacy `/?r=...` invitations. Crawling stays allowed so search engines can read those instructions. Client navigation removes public canonical/schema metadata in the workspace and restores it on return home.
- `robots.txt` advertises a sitemap containing the canonical public homepage. Decorative artwork retains its correct empty alt text; existing responsive WebP assets, dimensions, lazy loading and font preload remain.

## Verification

The production TypeScript/Vite/static build, all 96 unit/protocol tests and canonical protocol comparison pass. `npm run check:seo` checks delivered HTML, useful public content and FAQ answers, indexing policies, structured data, social image dimensions, sitemap, shared client entry and deployment rules; it is also required in Web CI.

[Local HTTP evidence](2026-10-05-bonjou-seo-evidence/local-http.json) verifies actual responses for the public page and five application/room routes, including HTTP `X-Robots-Tag` headers. Chrome verified the exact title, canonical/schema/robots changes on opening the app and browser Back, single FAQ expansion, both themes, a narrow layout without horizontal overflow, and a genuine approved local demo with matching SHA-256 hashes. Chrome also loaded the delivered homepage with JavaScript disabled. The temporary script-disable and viewport overrides were restored. Chrome recorded no page errors.

- [Desktop light](2026-10-05-bonjou-seo-evidence/chrome-desktop-light.jpg)
- [Narrow dark layout](2026-10-05-bonjou-seo-evidence/chrome-mobile-dark.jpg) (433 CSS px measured in the user's Chrome at its existing zoom)
- [JavaScript-disabled content](2026-10-05-bonjou-seo-evidence/chrome-no-javascript.jpg)

Fresh hosted browser checks and deployed-preview checks are required before merge. Their final results are recorded in the pull request. Ranking changes and Google indexing are not established by these code checks; no Search Console property, account or submission was created.

## Source documents

- [Google SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide): useful content, clear descriptions, links, images and canonicalization. Read in Chrome from Google search.
- [Google JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics): prerendered content, canonical tags and indexing during rendering. Read in Chrome.
- [Google robots meta and HTTP headers](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag): noindex and the need to allow crawling of its response. Read in Chrome.
- [Google site names](https://developers.google.com/search/docs/appearance/site-names): truthful homepage WebSite structured data.
- [Vite SSR](https://vite.dev/guide/ssr.html): built-in module loading and framework rendering APIs.
- [Vercel configuration](https://vercel.com/docs/project-configuration/vercel-json): query-aware rewrites and response headers.
