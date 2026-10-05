import { DownloadSimple as ArrowDownToLine } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { TerminalWindow } from "@phosphor-icons/react/dist/csr/TerminalWindow";

import { CopyButton } from "@/components/interior/copy-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export interface TerminalDisplayProps {
  /** The shell command string or download URL */
  command: string;
  /** OS label, e.g., "macOS", "Linux", "Windows" */
  osLabel?: string;
  /** Shell type or method title, e.g., "bash", "zsh", "powershell", "Homebrew", "WinGet" */
  shellType?: string;
  /** Terminal prompt symbol, e.g., "$", "PS>", ">" */
  prompt?: string;
  /** If true, renders a direct download link button instead of a copy button */
  isLink?: boolean;
  /** Optional additional CSS class names */
  className?: string;
}

/**
 * Reusable macOS-style terminal code display component with multi-OS support,
 * dark theme styling, top window dots, prompt indicator, embedded header copy button,
 * interactive external URLs for binary releases, and responsive horizontal scroll.
 */
export function TerminalDisplay({
  command,
  osLabel = "macOS",
  shellType,
  prompt,
  isLink = false,
  className = "",
}: TerminalDisplayProps) {
  const defaultPrompt =
    prompt ??
    (osLabel.toLowerCase() === "windows" ||
    shellType?.toLowerCase() === "powershell"
      ? "PS>"
      : "$");

  const title = shellType
    ? shellType.toLowerCase().includes(osLabel.toLowerCase())
      ? shellType
      : `${osLabel} (${shellType})`
    : `${osLabel} terminal`;

  const lines = command.split("\n");

  return (
    <Card className={`terminal mb-3 gap-0 p-0 ${className}`.trim()}>
      <CardHeader className="terminal-bar flex items-center gap-2 border-b px-4 py-3">
        <TerminalWindow
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {title}
        </span>
        <span className="spacer" />
        {isLink ? (
          <Button asChild variant="outline" className="h-8 px-3">
            <a
              href={command}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Download ${osLabel} binary release`}
            >
              <ArrowDownToLine
                size={18}
                className="size-[1.125rem]"
                aria-hidden="true"
              />
              Download
            </a>
          </Button>
        ) : (
          <CopyButton
            value={command}
            label="Copy"
            copiedLabel="Copied!"
            className="h-8 px-3"
          />
        )}
      </CardHeader>
      <CardContent
        className="terminal-body"
        tabIndex={isLink ? undefined : 0}
        role="region"
        aria-label={`${title} command`}
      >
        {isLink ? (
          <div className="terminal-line">
            <ArrowDownToLine
              size={18}
              className="recipe-glyph"
              aria-hidden="true"
            />
            <a
              href={command}
              target="_blank"
              rel="noopener noreferrer"
              className="terminal-url-link"
              title="Open GitHub Releases page in a new tab"
            >
              {command}
            </a>
          </div>
        ) : (
          lines.map((line, idx) => (
            <div className="terminal-line" key={idx}>
              <span className="prompt">{defaultPrompt}</span>
              <code>{line}</code>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
