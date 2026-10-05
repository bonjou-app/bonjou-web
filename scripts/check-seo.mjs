import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Check delivered build artifacts, independently of the metadata generators.
const root = new URL("../", import.meta.url);
const site = "https://bonjou.vercel.app/";
const read = (path) => readFile(new URL(path, root), "utf8");
const [home, workspace, robots, sitemap, configText] = await Promise.all([
  read("dist/index.html"), read("dist/app-shell.html"),
  read("dist/robots.txt"), read("dist/sitemap.xml"), read("vercel.json"),
]);
const attributes = (raw) => Object.fromEntries(
  [...raw.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)].map(([, key, , value]) => [key, value]),
);
const tags = (html, tag) => [...html.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, "gi"))]
  .map(([, raw]) => attributes(raw));
const text = (html) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
function meta(html, key) {
  const matches = tags(html, "meta").filter((tag) => tag.name === key || tag.property === key);
  assert.equal(matches.length, 1, `Expected one ${key} metadata tag`);
  return matches[0].content;
}
for (const [name, html] of [["homepage", home], ["workspace", workspace]]) {
  assert.deepEqual([...html.matchAll(/<title\b[^>]*>(.*?)<\/title>/gs)].map(([, title]) => title),
    ["bonjou-web"], `${name} must have the requested single tab title`);
  assert.ok(meta(html, "description").length > 40, `${name} needs a useful description`);
  assert.equal(meta(html, "og:title"), "bonjou-web");
  assert.equal(meta(html, "twitter:title"), "bonjou-web");
}
assert.doesNotMatch(meta(home, "robots"), /\bnoindex\b/, "Public homepage must be indexable");
assert.match(meta(workspace, "robots"), /\bnoindex\b/, "Workspace must not be indexed");
assert.deepEqual(tags(home, "link").filter((tag) => tag.rel === "canonical").map((tag) => tag.href), [site]);
assert.equal(tags(workspace, "link").filter((tag) => tag.rel === "canonical").length, 0);
const headings = [...home.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)];
assert.equal(headings.length, 1, "Homepage needs one delivered main heading");
assert.match(text(headings[0][1]), /Pass it along/);
const body = text(home.split(/<body\b[^>]*>/i)[1]);
for (const phrase of [
  "Send files, folders, and messages directly", "to another device on your Wi-Fi.",
  "separate way to share with other CLI users",
]) assert.ok(body.includes(phrase), `Delivered content is missing: ${phrase}`);
const faq = [...home.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/g)]
  .find(([, raw]) => attributes(raw).id === "faq")?.[2];
assert.ok(faq, "Deliver the FAQ section");
for (const phrase of [
  "same reachable local network",
  "Browsers use an online coordinator", "For fully offline sharing between computers, use bonjou-cli on both.",
  "Folders arrive as ZIP archives.", "Some guest and office networks block direct connections.",
  "compare the security codes with them in person",
]) assert.ok(text(faq).includes(phrase), `Delivered FAQ answer is missing: ${phrase}`);
assert.equal((faq.match(/data-slot="accordion-content"/g) ?? []).length, 5, "Deliver all five FAQ answers");
assert.doesNotMatch(workspace, /<h1\b|id="hero-title"|data-slot="accordion-content"|application\/ld\+json/);
const entries = (html) => tags(html, "script").filter((tag) => tag.type === "module" && tag.src).map((tag) => tag.src);
assert.equal(entries(home).length, 1);
assert.match(entries(home)[0], /^\/assets\/.+-[\w-]+\.js$/);
assert.deepEqual(entries(workspace), entries(home), "Both routes must load the same client application");
const schemas = [...home.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter(([, raw]) => attributes(raw).type === "application/ld+json");
assert.equal(schemas.length, 1);
const schema = JSON.parse(schemas[0][2]);
assert.equal(schema["@type"], "WebSite");
assert.equal(schema.name, "bonjou-web");
assert.equal(schema.url, site);
assert.doesNotMatch(JSON.stringify(schema), /"(?:aggregateRating|review|interactionStatistic|ratingValue|ratingCount)"/);
assert.doesNotMatch(robots, /^\s*Disallow:\s*(?:\*|\/(?:\s*$|app|share|r\/))/im, "Crawlers must be able to read workspace noindex");
assert.ok(robots.includes(`Sitemap: ${site}sitemap.xml`));
assert.deepEqual([...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(([, url]) => url), [site]);
const image = new URL(meta(home, "og:image"));
assert.equal(image.origin, new URL(site).origin);
assert.equal(meta(home, "twitter:image"), image.href);
const png = await readFile(new URL(`dist${image.pathname}`, root));
assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
assert.equal(png.subarray(12, 16).toString(), "IHDR");
assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [512, 512]);
assert.equal(meta(home, "og:image:width"), "512");
assert.equal(meta(home, "og:image:height"), "512");
const config = JSON.parse(configText);
const hasRoomQuery = (rule) => rule.source === "/" && rule.has?.some((condition) => condition.type === "query" && condition.key === "r");
const noindex = (rule) => rule.headers?.some((header) => header.key.toLowerCase() === "x-robots-tag" && /\bnoindex\b/.test(header.value));
for (const route of ["/app", "/share", "/r/:code"]) {
  assert.ok(config.rewrites.some((rule) => rule.source === route && rule.destination === "/app-shell.html"), `Missing private rewrite: ${route}`);
  assert.ok(config.headers.some((rule) => rule.source === route && noindex(rule)), `Missing noindex header: ${route}`);
}
assert.ok(config.rewrites.some((rule) => hasRoomQuery(rule) && rule.destination === "/app-shell.html"));
assert.ok(config.headers.some((rule) => hasRoomQuery(rule) && noindex(rule)));
assert.ok(config.headers.some((rule) => rule.source === "/app-shell.html" && noindex(rule)));
console.log("SEO build verification passed: public content, private indexing, metadata, sitemap, and social image");
