import { ArrowSquareOut as ExternalLink } from "@phosphor-icons/react/dist/csr/ArrowSquareOut";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Logo } from "./Logo";

/**
 * What a second tab shows.
 *
 * Bonjou is a presence: other people see a name in a list and send things
 * to it. Two tabs would be two names, and nobody outside this browser can
 * tell they are one person, so the second tab does not connect at all.
 *
 * It offers to take the session rather than refusing outright, because
 * the tab somebody is looking at is the one they mean to use, and a tab
 * left open in another window an hour ago should not win by seniority.
 */
export function TabTaken({ onTakeOver }: { onTakeOver: () => void }) {
  return (
    <main className="gate">
      <div className="gate-bar">
        <a href="/" className="gate-home" aria-label="Bonjou home">
          <Logo size={20} />
          <span className="gate-brand">bonjou</span>
        </a>
        <span className="spacer" />
        <span className="gate-status">
          <span className="blip is-closed" aria-hidden="true" />
          not connected
        </span>
      </div>

      <Card className="gate-body w-[calc(100%-2rem)] max-w-md self-center justify-self-center my-12 [--card-spacing:--spacing(7)] shadow-sm">
        <CardHeader className="gap-3">
          <CardTitle>
            <h1 className="text-2xl font-semibold tracking-tight">
              Bonjou is running
              <br />
              in another tab.
            </h1>
          </CardTitle>
          <CardDescription className="leading-relaxed">
            Your session is active in another tab. Switch it here to keep
            chatting and sharing in this window.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Button type="button" className="h-11 w-full" onClick={onTakeOver}>
            <ExternalLink
              size={18}
              className="size-[1.125rem]"
              aria-hidden="true"
            />
            Use it in this tab
          </Button>
        </CardContent>

        <CardFooter>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Switching disconnects the other tab. Finish any active file
            transfers before you switch.
          </p>
        </CardFooter>
      </Card>
    </main>
  );
}
