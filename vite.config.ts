import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

import { isApplicationUrl, renderMetadata } from "./src/share/seo.ts";
import { resolveCoordinatorBase } from "./src/share/coordinatorConfig.ts";

const entry = (name: string) => fileURLToPath(new URL(name, import.meta.url));

function buildRevision(): string | undefined {
  let value = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA;
  if (!value) {
    try {
      value = execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      // Source archives can still build; exact-revision deployment checks
      // require the hosting platform to provide its source revision.
      return undefined;
    }
  }
  return /^[a-f0-9]{40}$/i.test(value) ? value.toLowerCase() : undefined;
}

/**
 * Mirrors the rewrites in vercel.json.
 *
 * The public homepage and private workspace have different indexing policies.
 * Mirror production routes in both development and the built preview.
 */
const rewrites = (): Plugin => ({
  name: "bonjou-rewrites",
  configureServer(server) {
    server.middlewares.use(applicationRewrite(false));
  },
  configurePreviewServer(server) {
    server.middlewares.use(applicationRewrite(true));
  },
  transformIndexHtml: {
    order: "pre",
    handler(html, context) {
      const url = new URL(
        context.originalUrl ?? context.path,
        "http://bonjou.invalid",
      );
      return html.replace(
        "<!--seo-metadata-->",
        renderMetadata(isApplicationUrl(url.pathname, url.search)),
      );
    },
  },
});

function applicationRewrite(preview: boolean) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? "/", "http://bonjou.invalid");
    if (isApplicationUrl(url.pathname, url.search)) {
      res.setHeader("X-Robots-Tag", "noindex, follow");
      req.url = `${preview ? "/app-shell.html" : "/index.html"}${url.search}`;
    }
    next();
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(), tailwindcss(), rewrites(),
    {
      name: "bonjou-public-coordinator-config",
      generateBundle() {
        // This public URL is already embedded in browser JS. Recording it
        // makes postdeployment checks exercise the endpoint actually shipped.
        this.emitFile({
          type: "asset",
          fileName: "coordinator-config.json",
          source: JSON.stringify({
            version: 1,
            revision: buildRevision(),
            coordinator: resolveCoordinatorBase(loadEnv(mode, process.cwd(), "VITE_").VITE_COORDINATOR_URL),
          }) + "\n",
        });
      },
    },
  ],
  resolve: { alias: { "@": entry("src") } },
  build: {
    // Preserve Vite 6's syntax targets across the bundler upgrade.
    target: ["es2020", "chrome87", "edge88", "firefox78", "safari14"],
    rolldownOptions: {
      input: {
        // One entry. "/" is served by index.html directly; vercel.json only
        // rewrites the client routes "/app" and "/r/{code}" onto it. An
        // earlier standalone marketing page and its React entry lived
        // alongside this and are in git history if ever wanted back.
        share: entry("index.html"),
      },
    },
  },
}));
