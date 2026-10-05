import { renderToStaticMarkup } from "react-dom/server";

import { TooltipProvider } from "@/components/ui/tooltip";
import { Landing } from "./Landing";

export { renderMetadata } from "./seo";

/** Render the same public content for visitors and crawlers at build time. */
export function renderLandingHtml(): string {
  return renderToStaticMarkup(
    <TooltipProvider>
      <Landing theme="light" onOpenApp={() => {}} onToggleTheme={() => {}} />
    </TooltipProvider>,
  );
}
