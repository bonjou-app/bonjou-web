import { useState } from "react";
import { DownloadSimple as ArrowDownToLine } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { FileText } from "@phosphor-icons/react/dist/csr/FileText";
import { TerminalWindow as SquareChevronRight } from "@phosphor-icons/react/dist/csr/TerminalWindow";

import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TerminalDisplay } from "./TerminalDisplay";

/**
 * Getting bonjou-cli onto your machine.
 *
 * The job here is narrow: one person, on one operating system, wants the
 * one line that works for them. So the platform is detected, the command
 * is presented as a terminal because that is literally where it goes, and
 * copying is a button rather than a drag.
 *
 * Every command is verbatim from README.md. They are executed as written,
 * so they are never paraphrased, shortened, or pointed at a nicer-looking
 * domain. If a command here stops matching the README, the README wins.
 */

const RAW = "https://raw.githubusercontent.com/bonjou-app/bonjou-cli/main";
const REPO = "https://github.com/bonjou-app/bonjou-cli";
const RELEASES = `${REPO}/releases/latest`;

interface Recipe {
  name: string;
  badge?: string;
  /** Verbatim. Several lines when the README gives several. */
  command: string;
  /** Shown instead of a prompt when the target is a page, not a shell. */
  link?: boolean;
  why: string;
}

interface Platform {
  id: string;
  label: string;
  prompt: string;
  primary: Recipe;
  alternatives: Recipe[];
}

const PLATFORMS: Platform[] = [
  {
    id: "macos",
    label: "macOS",
    prompt: "$",
    primary: {
      name: "Install script",
      badge: "Recommended",
      command: `curl -fsSL ${RAW}/scripts/install.sh | bash`,
      why: "One line, nothing else required. It detects Apple silicon or Intel and puts the binary on your PATH.",
    },
    alternatives: [
      {
        name: "Homebrew",
        command: "brew install hamzaabdulwahab/bonjou/bonjou",
        why: "Pick this if you already use brew. Upgrades then arrive with brew upgrade, along with everything else.",
      },
      {
        name: "Binary Release",
        command: RELEASES,
        link: true,
        why: "Archives for arm64 and amd64. Unpack it and move bonjou anywhere on your PATH.",
      },
    ],
  },
  {
    id: "linux",
    label: "Linux",
    prompt: "$",
    primary: {
      name: "Install script",
      badge: "Recommended",
      command: `curl -fsSL ${RAW}/scripts/install.sh | bash`,
      why: "Distribution-agnostic. It needs curl and write access to /usr/local/bin, and will ask for sudo once.",
    },
    alternatives: [
      {
        name: "Debian · Ubuntu",
        command: `wget ${REPO}/releases/download/v1.2.0/bonjou_1.2.0_amd64.deb\nsudo dpkg -i bonjou_1.2.0_amd64.deb`,
        why: "For amd64. The releases page carries an arm64 .deb built the same way, for a Raspberry Pi or an ARM VM.",
      },
      {
        name: "Binary Release",
        command: RELEASES,
        link: true,
        why: "A single static binary. No runtime, no daemon, nothing to configure.",
      },
    ],
  },
  {
    id: "windows",
    label: "Windows",
    prompt: "PS>",
    primary: {
      name: "WinGet Package Manager",
      badge: "Recommended",
      command: "winget install HamzaAbdulWahab.Bonjou",
      why: "Built into Windows 11 and recent Windows 10. Provides clean setup and automatic updates.",
    },
    alternatives: [
      {
        name: "PowerShell Script",
        command: `iwr ${RAW}/scripts/install.ps1 -useb | iex`,
        why: "Run it in PowerShell, not cmd. No admin rights are needed: it installs for the current user.",
      },
      {
        name: "Scoop Package Manager",
        command:
          "scoop install https://raw.githubusercontent.com/hamzaabdulwahab/scoop-bonjou/main/bonjou.json",
        why: "Keeps everything under your user profile and nothing in Program Files.",
      },
      {
        name: "Binary Release (.exe)",
        command: RELEASES,
        link: true,
        why: "Standalone bonjou.exe for amd64 and arm64. Windows may warn on first run, because it is unsigned.",
      },
    ],
  },
];

function detectPlatform(): string {
  if (typeof navigator === "undefined") return "macos";
  const ua = `${navigator.userAgent} ${navigator.platform ?? ""}`;
  if (/win/i.test(ua)) return "windows";
  if (/mac|iphone|ipad/i.test(ua)) return "macos";
  if (/linux|x11|android|cros/i.test(ua)) return "linux";
  return "macos";
}

export function Install() {
  const [active, setActive] = useState<string>(detectPlatform);
  const platform = PLATFORMS.find((p) => p.id === active) ?? PLATFORMS[0];

  const verificationShell =
    platform.id === "windows" ? "PowerShell Verification" : "Verification";

  return (
    <Tabs value={active} onValueChange={setActive} className="install">
      <TabsList
        className="install-tabs group-data-horizontal/tabs:h-11 mb-6 max-w-full"
        aria-label="Operating system"
      >
        {PLATFORMS.map((entry) => (
          <TabsTrigger
            key={entry.id}
            value={entry.id}
            className="h-9 px-5 max-[420px]:px-3"
          >
            {entry.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value={platform.id} className="install-grid">
        <div className="install-main">
          <div className="recipe-head">
            <span className="recipe-name">{platform.primary.name}</span>
            {platform.primary.badge ? (
              <Badge variant="outline" className="recipe-badge">
                <span className="recipe-badge-dot" aria-hidden="true" />
                {platform.primary.badge}
              </Badge>
            ) : null}
          </div>

          <TerminalDisplay
            command={platform.primary.command}
            osLabel={platform.label}
            shellType={platform.id === "windows" ? "WinGet" : "install.sh"}
            prompt={platform.prompt}
          />

          <p className="recipe-why">{platform.primary.why}</p>

          <Accordion type="single" collapsible className="install-alternatives">
            <AccordionItem value="alternatives">
              <AccordionTrigger>Other ways to install</AccordionTrigger>
              <AccordionContent>
                {platform.alternatives.map((alt) => (
                  <div className="recipe" key={alt.name}>
                    <div className="recipe-head">
                      <span className="recipe-name">{alt.name}</span>
                    </div>
                    <TerminalDisplay
                      command={alt.command}
                      osLabel={platform.label}
                      shellType={alt.name}
                      prompt={alt.link ? undefined : platform.prompt}
                      isLink={alt.link}
                    />
                    <p className="recipe-why">{alt.why}</p>
                  </div>
                ))}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <aside className="install-side">
          <p className="bj-label is-spaced">Ready to go</p>
          <TerminalDisplay
            command={`bonjou --version\nbonjou`}
            osLabel={platform.label}
            shellType={verificationShell}
            prompt={platform.prompt}
          />
          <p className="recipe-why">
            The first command checks your install. The second opens Bonjou. Run
            it on another computer on your network to start sharing.
          </p>

          <div className="install-links">
            <a
              href={`${REPO}/blob/main/docs/install-guide.md`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <FileText
                size={18}
                className="size-[1.125rem]"
                aria-hidden="true"
              />
              Full install guide
            </a>
            <a
              href={`${REPO}/blob/main/HELP.md`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <SquareChevronRight
                size={18}
                className="size-[1.125rem]"
                aria-hidden="true"
              />
              Command reference
            </a>
            <a href={RELEASES} target="_blank" rel="noopener noreferrer">
              <ArrowDownToLine
                size={18}
                className="size-[1.125rem]"
                aria-hidden="true"
              />
              All releases and checksums
            </a>
          </div>
        </aside>
      </TabsContent>
    </Tabs>
  );
}
