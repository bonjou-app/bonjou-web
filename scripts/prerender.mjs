import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "vite";

// This server only transforms modules in memory; no production runtime or new
// dependency is needed. The client retains its normal, theme-aware mount.
const vite = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
try {
  const { renderLandingHtml, renderMetadata } = await vite.ssrLoadModule(
    "/src/share/entry-static.tsx",
  );
  const template = await readFile("dist/index.html", "utf8");
  if (!template.includes("<!--landing-html-->")) {
    throw new Error("Landing HTML placeholder is missing from the build");
  }
  const head = /<!--seo-metadata-start-->[\s\S]*?<!--seo-metadata-end-->/;
  if (!head.test(template)) throw new Error("SEO metadata is missing from the build");
  const landing = template.replace("<!--landing-html-->", renderLandingHtml());
  const workspace = template
    .replace("<!--landing-html-->", "")
    .replace(head, renderMetadata(true));
  await writeFile("dist/index.html", landing);
  await writeFile("dist/app-shell.html", workspace);
  console.log("Prerendered public landing and separate noindex workspace shell");
} finally {
  await vite.close();
}
