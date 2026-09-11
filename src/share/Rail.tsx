import { useEffect, useMemo, useRef, useState } from "react";
import { DownloadSimple as ArrowDownToLine } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { Command as CommandIcon } from "@phosphor-icons/react/dist/csr/Command";
import { Copy } from "@phosphor-icons/react/dist/csr/Copy";
import { Moon } from "@phosphor-icons/react/dist/csr/Moon";
import { Broadcast as Radio } from "@phosphor-icons/react/dist/csr/Broadcast";
import { MagnifyingGlass as Search } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { GearSix as Settings } from "@phosphor-icons/react/dist/csr/GearSix";
import { Sun } from "@phosphor-icons/react/dist/csr/Sun";
import { Ticket } from "@phosphor-icons/react/dist/csr/Ticket";

import { useCopyToClipboard } from "@/components/interior/copy-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Logo } from "./Logo";
import type { ConnectionStatus, Peer } from "./coordinator";
import { EVERYONE } from "./useSession";
import type { ResolvedTheme } from "./theme";
import { usePlatform } from "./usePlatform";

interface RailProps {
  name: string;
  status: ConnectionStatus;
  peers: Peer[];
  labels: Record<string, string>;
  unread: Record<string, number>;
  receivedCount: number;
  activeId: string;
  networkGrouped: boolean;
  code: string;
  theme: ResolvedTheme;
  onToggleTheme: () => void;
  onSelect: (id: string) => void;
  onOpenPalette: () => void;
  onOpenSettings: () => void;
  onOpenRoom: () => void;
  onCopyLink: () => void;
}

const STATUS_TEXT: Record<ConnectionStatus, string> = {
  idle: "Starting",
  connecting: "Connecting",
  connected: "Connected",
  reconnecting: "Reconnecting",
  closed: "Offline",
};

export function Rail(props: RailProps) {
  const {
    name,
    status,
    peers,
    labels,
    unread,
    receivedCount,
    activeId,
    networkGrouped,
    code,
    theme,
    onToggleTheme,
    onSelect,
    onOpenPalette,
    onOpenSettings,
    onOpenRoom,
    onCopyLink,
  } = props;

  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);

  // "/" focuses search, the way it does in every tool with a list this
  // long. Ignored while already typing, or the character never arrives.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (searchRef.current?.closest("[hidden]")) return;
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey)
        return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }
      event.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const needle = query.trim().toLowerCase();
  const match = (peer: Peer) =>
    !needle || (labels[peer.id] ?? peer.name).toLowerCase().includes(needle);

  const wifi = useMemo(
    () => peers.filter((peer) => peer.source === "network" && match(peer)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [peers, labels, needle],
  );
  const room = useMemo(
    () => peers.filter((peer) => peer.source === "code" && match(peer)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [peers, labels, needle],
  );

  const noMatches = Boolean(needle) && wifi.length === 0 && room.length === 0;

  const { isMac, isMobile } = usePlatform();
  const { copy } = useCopyToClipboard({ onCopy: onCopyLink });

  return (
    <aside className="rail" aria-label="Conversations">
      <div className="rail-brand">
        <a href="/" className="gate-home" aria-label="Bonjou home">
          <Logo size={20} />
          <span className="rail-name">bonjou</span>
        </a>
        <Badge variant="secondary">web</Badge>
        <span className="spacer" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11"
              onClick={onToggleTheme}
              aria-label={
                theme === "dark" ? "Switch to light" : "Switch to dark"
              }
            >
              {theme === "dark" ? (
                <Sun size={18} className="size-[1.125rem]" aria-hidden="true" />
              ) : (
                <Moon
                  size={18}
                  className="size-[1.125rem]"
                  aria-hidden="true"
                />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {theme === "dark" ? "Light theme" : "Dark theme"}
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="rail-status">
        <span className={`blip is-${status}`} aria-hidden="true" />
        <span className={`rail-live is-${status}`}>{STATUS_TEXT[status]}</span>
        <Separator
          orientation="vertical"
          className="rail-sep h-3!"
          aria-hidden="true"
        />
        <span className="rail-count">{peers.length} reachable</span>
        <span className="spacer" />
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="rail-cmd min-h-11 min-w-11"
          onClick={onOpenPalette}
          aria-label="Open the command palette"
        >
          {isMobile ? (
            <Search size={18} className="size-[1.125rem]" aria-hidden="true" />
          ) : isMac ? (
            <>
              <CommandIcon
                size={18}
                className="size-[1.125rem]"
                aria-hidden="true"
              />
              <span>K</span>
            </>
          ) : (
            <span>Ctrl K</span>
          )}
        </Button>
      </div>

      <div className="px-4 pb-6">
        <InputGroup className="h-10 bg-background">
          <InputGroupAddon>
            <Search size={18} className="size-[1.125rem]" aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search people"
            aria-label="Search people"
          />
          <InputGroupAddon align="inline-end">
            <span className="bj-kbd" aria-hidden="true">
              /
            </span>
          </InputGroupAddon>
        </InputGroup>
      </div>

      <div className="rail-list bj-scroll">
        <p className="bj-label">Conversations</p>
        <Button
          type="button"
          variant="ghost"
          className="chip is-group mb-1 h-12 w-full justify-start gap-3 px-3 aria-[current=true]:bg-background aria-[current=true]:shadow-xs"
          aria-current={activeId === EVERYONE}
          onClick={() => onSelect(EVERYONE)}
        >
          <span className="chip-mark" aria-hidden="true">
            <Radio size={18} />
          </span>
          <span className="chip-name">
            {code ? `Room ${code}` : "Everyone here"}
          </span>
          <Badge variant="outline" className="chip-tag">
            {peers.length}
          </Badge>
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="chip is-group mb-1 h-12 w-full justify-start gap-3 px-3 aria-[current=true]:bg-background aria-[current=true]:shadow-xs"
          aria-current={activeId === "received"}
          onClick={() => onSelect("received")}
        >
          <span className="chip-mark" aria-hidden="true">
            <ArrowDownToLine size={18} />
          </span>
          <span className="chip-name">Received files</span>
          <Badge variant="outline" className="chip-tag">
            {receivedCount}
          </Badge>
        </Button>

        <PeerGroup
          label="On your Wi-Fi"
          peers={wifi}
          labels={labels}
          unread={unread}
          activeId={activeId}
          onSelect={onSelect}
          tag="wi-fi"
        />
        <PeerGroup
          label="Joined by code"
          peers={room}
          labels={labels}
          unread={unread}
          activeId={activeId}
          onSelect={onSelect}
          tag="room"
        />

        {noMatches ? (
          <p className="rail-note">Nobody here matches that.</p>
        ) : null}

        {peers.length === 0 && !needle ? (
          <Alert
            role="status"
            className="rail-empty mt-6 border-0 bg-transparent shadow-none"
          >
            <AlertDescription>
              {status === "closed" || status === "reconnecting" ? (
                <>
                  <p className="bj-label is-warn">Offline</p>
                  <p>
                    Reconnecting. Interrupted transfers need to be sent again.
                    Check your downloads for partial files.
                  </p>
                </>
              ) : networkGrouped ? (
                <>
                  <p className="bj-label">Waiting for people</p>
                  <p>
                    People appear here when they open Bonjou on the same Wi-Fi
                    and connect to you.
                  </p>
                </>
              ) : (
                <>
                  <p className="bj-label is-warn">Network too large</p>
                  <p>
                    Too many devices share your network address to group them
                    safely. A campus or carrier network can put a whole region
                    behind one address.
                  </p>
                  <Button
                    type="button"
                    className="h-10 px-4"
                    onClick={onOpenRoom}
                  >
                    Open a room instead
                  </Button>
                </>
              )}
            </AlertDescription>
          </Alert>
        ) : null}
      </div>

      <div className="rail-foot">
        {/*
          Two controls, not one with a nested second: a button inside a
          button is invalid, and screen readers flatten it into a single
          confusing target.
        */}
        <div className="rail-room">
          <Button
            type="button"
            variant="ghost"
            className="rail-room-open h-auto min-h-14 min-w-0 flex-1 justify-start gap-3 px-3 py-3 text-left"
            onClick={onOpenRoom}
          >
            <Ticket size={18} className="size-[1.125rem]" aria-hidden="true" />
            <span className="rail-room-copy">
              <span>
                {code ? "Your private room" : "Create or join a room"}
              </span>
              {code ? (
                <code>{code}</code>
              ) : (
                <small>A space for a smaller group</small>
              )}
            </span>
          </Button>
          {code ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  onClick={() =>
                    void copy(`${window.location.origin}/r/${code}`)
                  }
                  aria-label="Copy the room link"
                >
                  <Copy
                    size={18}
                    className="size-[1.125rem]"
                    aria-hidden="true"
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy room link</TooltipContent>
            </Tooltip>
          ) : null}
        </div>

        <Button
          type="button"
          variant="ghost"
          className="rail-me mt-2 h-auto min-h-14 w-full justify-start gap-3 px-3 py-2"
          onClick={onOpenSettings}
          aria-label="Open settings"
        >
          <Avatar className="size-8" size="sm" aria-hidden="true">
            <AvatarFallback>{name.slice(0, 1).toLowerCase()}</AvatarFallback>
          </Avatar>
          <span className="rail-me-name">{name}</span>
          <span className="spacer" />
          <Settings size={18} className="size-[1.125rem]" aria-hidden="true" />
        </Button>
      </div>
    </aside>
  );
}

function PeerGroup({
  label,
  peers,
  labels,
  unread,
  activeId,
  onSelect,
  tag,
}: {
  label: string;
  peers: Peer[];
  labels: Record<string, string>;
  unread: Record<string, number>;
  activeId: string;
  onSelect: (id: string) => void;
  tag: string;
}) {
  if (peers.length === 0) return null;
  return (
    <>
      <p className="bj-label is-spaced">{label}</p>
      {peers.map((peer) => (
        <Button
          key={peer.id}
          type="button"
          variant="ghost"
          className="chip mb-1 h-12 w-full justify-start gap-3 px-3 aria-[current=true]:bg-background aria-[current=true]:shadow-xs"
          aria-current={activeId === peer.id}
          onClick={() => onSelect(peer.id)}
        >
          <Avatar className="size-8" size="sm" aria-hidden="true">
            <AvatarFallback>
              {(labels[peer.id] ?? peer.name).slice(0, 1).toLowerCase()}
            </AvatarFallback>
          </Avatar>
          <span className="chip-name">{labels[peer.id] ?? peer.name}</span>
          {unread[peer.id] ? (
            <Badge
              className="chip-tag is-unread"
              aria-label={`${unread[peer.id]} new`}
            >
              {unread[peer.id]}
            </Badge>
          ) : (
            <Badge variant="outline" className="chip-tag">
              {tag}
            </Badge>
          )}
        </Button>
      ))}
    </>
  );
}
