import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Composer } from "./Composer";
import { FileIcon } from "./FileIcon";
import { NameGate } from "./NameGate";
import { Palette } from "./Palette";
import { Rail } from "./Rail";
import { Thread } from "./Thread";
import {
  RoomDialog,
  SettingsPanel,
  TransfersPanel,
  VerifyDialog,
  transferHistory,
} from "./Overlays";
import { formatBytes } from "./transfer";
import { notifyOffer, useSettings } from "./settings";
import { useVerified } from "./verified";
import type { Peer } from "./coordinator";
import { useMediaQuery, type ThemeChoice, type ResolvedTheme } from "./theme";
import { EVERYONE, type IncomingItem, type useSession } from "./useSession";

interface WorkspaceProps {
  name: string;
  onName: (value: string) => void;
  session: ReturnType<typeof useSession>;
  themeChoice: ThemeChoice;
  theme: ResolvedTheme;
  onThemeChoice: (choice: ThemeChoice) => void;
  onToggleTheme: () => void;
  visible?: boolean;
}

export function Workspace(props: WorkspaceProps) {
  const {
    name,
    onName,
    session,
    themeChoice,
    theme,
    onThemeChoice,
    onToggleTheme,
    visible = true,
  } = props;

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [activeId, setActiveId] = useState<string>(EVERYONE);
  const [mobileView, setMobileView] = useState<"list" | "thread">("list");
  const [palette, setPalette] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [transfersOpen, setTransfersOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [roomOpen, setRoomOpen] = useState(false);
  useEffect(() => {
    if (session.roomError || session.roomPending) setRoomOpen(true);
  }, [session.roomError, session.roomPending]);
  useEffect(() => {
    if (!visible) {
      setRoomOpen(false);
      setSettingsOpen(false);
      setTransfersOpen(false);
      setVerifyOpen(false);
      setPalette(false);
    }
  }, [visible]);

  const { settings, set: setSetting, enableNotifications } = useSettings();
  const { confirm, isVerified } = useVerified();
  // The offer sheet is a phone affordance. On a desktop the offer already
  // sits in the thread, and a second copy in a modal would be an
  // interruption rather than a help.
  const narrow = useMediaQuery("(max-width: 860px)");

  const fileInput = useRef<HTMLInputElement | null>(null);
  const folderInput = useRef<HTMLInputElement | null>(null);
  const announced = useRef(new Set<string>());

  const selectThread = useCallback((id: string) => {
    setActiveId(id);
    setMobileView("thread");
  }, []);

  // Names come from localStorage, which every tab of a browser profile
  // shares, so several peers legitimately arrive called the same thing.
  // Number the duplicates. Hex would be exact but reads as a serial
  // number, and nobody picks a person out of a list that way.
  const labels = useMemo(() => {
    const counts = new Map<string, number>();
    for (const peer of session.peers) {
      counts.set(peer.name, (counts.get(peer.name) ?? 0) + 1);
    }
    const seen = new Map<string, number>();
    const out: Record<string, string> = {};
    for (const peer of session.peers) {
      if ((counts.get(peer.name) ?? 0) > 1) {
        const nth = (seen.get(peer.name) ?? 0) + 1;
        seen.set(peer.name, nth);
        out[peer.id] = `${peer.name} (${nth})`;
      } else {
        out[peer.id] = peer.name;
      }
    }
    return out;
  }, [session.peers]);

  // A thread whose peer has left would otherwise strand the composer with
  // nobody to send to.
  useEffect(() => {
    if (activeId === EVERYONE || activeId === "received") return;
    if (!session.peers.some((peer) => peer.id === activeId))
      setActiveId(EVERYONE);
  }, [session.peers, activeId]);

  const { markRead } = session;
  useEffect(() => {
    const read = () => {
      if (
        visible &&
        document.visibilityState === "visible" &&
        (!narrow || mobileView === "thread")
      )
        markRead(activeId);
    };
    read();
    document.addEventListener("visibilitychange", read);
    return () => document.removeEventListener("visibilitychange", read);
  }, [activeId, session.events.length, markRead, narrow, mobileView, visible]);

  // A file offered while the tab is in the background is the one event
  // worth interrupting somebody for, and the only one wired to a system
  // notification.
  useEffect(() => {
    if (!settings.notifyOffers) return;
    for (const event of session.events) {
      if (event.kind !== "incoming") continue;
      const item = event.item;
      if (item.state !== "pending" || announced.current.has(item.requestId))
        continue;
      announced.current.add(item.requestId);
      notifyOffer(labels[item.from] ?? item.fromName, item.name);
    }
  }, [session.events, settings.notifyOffers, labels]);

  // Joining a room leaves the open network lobby. The coordinator therefore
  // gives this session only room candidates, making "Everyone" an exact room
  // broadcast rather than a client-side filtering convention.
  const inRoom = Boolean(session.code);
  const broadcast = session.peers;

  const targets = useMemo(() => {
    if (activeId === "received") return [];
    if (activeId === EVERYONE) return broadcast.map((peer) => peer.id);
    return session.peers.some((peer) => peer.id === activeId) ? [activeId] : [];
  }, [activeId, session.peers, broadcast]);

  const activePeer = session.peers.find((peer) => peer.id === activeId);

  const destination =
    activeId === EVERYONE
      ? broadcast.length === 1
        ? (labels[broadcast[0].id] ?? "everyone")
        : inRoom
          ? `room ${session.code}`
          : "everyone"
      : (labels[activeId] ?? "");

  const title =
    activeId === EVERYONE
      ? inRoom
        ? `Room ${session.code}`
        : "Everyone here"
      : activeId === "received"
        ? "Received files"
        : (labels[activeId] ?? "Received");

  const subtitle = threadSubtitle(
    activeId,
    broadcast,
    inRoom,
    session.received.length,
    session.pendingCount,
    activePeer,
  );

  const { sent, received } = useMemo(() => {
    let sentTotal = 0;
    let receivedTotal = 0;
    for (const event of session.events) {
      if (event.kind === "outgoing") sentTotal += event.item.sentBytes;
      if (event.kind === "incoming" && event.item.state === "done") {
        receivedTotal += event.item.size;
      }
    }
    return { sent: sentTotal, received: receivedTotal };
  }, [session.events]);

  const history = useMemo(
    () => transferHistory(session.events, labels),
    [session.events, labels],
  );

  // The newest offer still waiting on an answer. On a phone it is raised
  // into a sheet, because a decision buried in a scrolled thread is one
  // people miss.
  const pendingOffer = useMemo(() => {
    let latest: IncomingItem | null = null;
    for (const event of session.events) {
      if (event.kind !== "incoming") continue;
      if (event.item.state !== "pending") continue;
      if (!latest || event.item.at > latest.at) latest = event.item;
    }
    return latest;
  }, [session.events]);

  const copyLink = useCallback(() => {
    session.setNotice("Room link copied.");
  }, [session]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!visible) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette((open) => !open);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [visible]);

  if (!name) return visible ? <NameGate onName={onName} /> : null;

  const canVerify = Boolean(activePeer);
  const classes = [
    "workspace",
    `is-${mobileView}`,
    settings.compact ? "is-compact" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <main className={classes} hidden={!visible}>
      <h1 className="bj-sr">Bonjou workspace</h1>
      <Rail
        name={name}
        status={session.status}
        peers={session.peers}
        labels={labels}
        unread={session.unread}
        receivedCount={session.received.length}
        activeId={activeId}
        networkGrouped={session.networkGrouped}
        code={session.code}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onSelect={selectThread}
        onOpenPalette={() => setPalette(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenRoom={() => setRoomOpen(true)}
        onCopyLink={copyLink}
      />

      <div className="stage">
        <Thread
          threadId={activeId}
          title={title}
          subtitle={subtitle}
          events={session.events}
          received={session.received}
          labels={labels}
          canVerify={canVerify}
          onApprove={session.approve}
          onDecline={session.decline}
          onVerify={() => setVerifyOpen(true)}
          onHistory={() => setTransfersOpen(true)}
          onBack={() => setMobileView("list")}
          peerCount={session.peers.length}
          candidateCount={session.candidateCount}
          status={session.status}
          code={session.code}
          onRoom={() => setRoomOpen(true)}
          onRetry={session.retryConnection}
          verified={Boolean(activePeer && isVerified(activePeer.pubkey))}
        />

        {activeId === "received" || targets.length === 0 ? null : (
          <Composer
            key={activeId}
            draft={drafts[activeId] ?? ""}
            onDraft={(value) =>
              setDrafts((current) => ({ ...current, [activeId]: value }))
            }
            targets={targets}
            destination={destination}
            onSendText={session.sendText}
            onSendFiles={session.sendFiles}
          />
        )}
      </div>

      {/* Driven from the palette, which has no file control of its own. */}
      <Input
        ref={fileInput}
        type="file"
        multiple
        tabIndex={-1}
        disabled={targets.length === 0}
        className="bj-sr"
        aria-label="Choose files to send"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          if (files.length) session.sendFiles(targets, files);
          event.target.value = "";
        }}
      />
      <Input
        ref={folderInput}
        type="file"
        multiple
        tabIndex={-1}
        disabled={targets.length === 0}
        className="bj-sr"
        aria-label="Choose a folder to send"
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          if (files.length) session.sendFiles(targets, files, true);
          event.target.value = "";
        }}
      />

      <Palette
        open={palette}
        onOpenChange={setPalette}
        peers={session.peers}
        labels={labels}
        canVerify={canVerify}
        canSend={targets.length > 0}
        onSelectThread={selectThread}
        onPickFiles={() => fileInput.current?.click()}
        onPickFolder={() => folderInput.current?.click()}
        onRoom={() => setRoomOpen(true)}
        onVerify={() => setVerifyOpen(true)}
        onToggleTheme={onToggleTheme}
        onSettings={() => setSettingsOpen(true)}
        onTransfers={() => setTransfersOpen(true)}
      />

      <VerifyDialog
        open={verifyOpen}
        onOpenChange={setVerifyOpen}
        peerName={activePeer ? (labels[activePeer.id] ?? activePeer.name) : ""}
        fingerprint={
          activePeer ? (session.fingerprints[activePeer.id] ?? "") : ""
        }
        verified={Boolean(activePeer && isVerified(activePeer.pubkey))}
        onConfirm={() => activePeer && confirm(activePeer.pubkey)}
      />

      <RoomDialog
        open={roomOpen}
        onOpenChange={setRoomOpen}
        code={session.code}
        onCreate={session.createRoom}
        onJoin={session.joinRoom}
        onLeave={() => {
          session.leaveRoom();
          setRoomOpen(false);
          setActiveId(EVERYONE);
        }}
        pending={session.roomPending}
        error={session.roomError}
      />

      <SettingsPanel
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        name={name}
        onName={onName}
        themeChoice={themeChoice}
        onTheme={onThemeChoice}
        settings={settings}
        onSetting={setSetting}
        onEnableNotifications={enableNotifications}
        sentBytes={sent}
        receivedBytes={received}
      />

      <TransfersPanel
        open={transfersOpen}
        onOpenChange={setTransfersOpen}
        entries={history}
      />

      {pendingOffer && narrow && visible ? (
        <Drawer open shouldScaleBackground={false} dismissible={false}>
          <DrawerContent className="sheet pb-[env(safe-area-inset-bottom)]">
            <DrawerHeader className="text-left">
              <DrawerTitle className="text-lg">
                {labels[pendingOffer.from] ?? pendingOffer.fromName} is offering
              </DrawerTitle>
              <p className="sheet-name mt-2 text-lg font-semibold">
                <FileIcon
                  name={pendingOffer.name}
                  folder={Boolean(pendingOffer.note)}
                  size={22}
                />
                {pendingOffer.name}
              </p>
              <DrawerDescription className="sheet-meta">
                {formatBytes(pendingOffer.size)}
                {pendingOffer.note ? ` · ${pendingOffer.note}` : ""}
              </DrawerDescription>
            </DrawerHeader>
            <p className="px-4 text-sm leading-relaxed text-muted-foreground">
              Nothing has downloaded yet. The bytes are still on their machine,
              and approving is what starts the transfer.
            </p>
            <DrawerFooter>
              <Button
                type="button"
                className="h-12 px-6 text-[0.9375rem]"
                onClick={() => session.approve(pendingOffer)}
              >
                Approve and download
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-12 px-6 text-[0.9375rem]"
                onClick={() => session.decline(pendingOffer)}
              >
                Decline
              </Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : null}
    </main>
  );
}

function threadSubtitle(
  activeId: string,
  broadcast: Peer[],
  inRoom: boolean,
  receivedCount: number,
  pendingCount: number,
  activePeer?: Peer,
): string {
  if (activeId === "received") {
    return receivedCount === 1
      ? "1 file this session · nothing kept after you close the tab"
      : `${receivedCount} files this session · nothing kept after you close the tab`;
  }
  if (activeId === EVERYONE) {
    if (broadcast.length === 0) {
      return inRoom
        ? "Nobody has joined yet, share the code"
        : "Nobody reachable yet";
    }
    return [
      broadcast.length === 1 ? "1 person" : `${broadcast.length} people`,
      pendingCount > 0 ? `${pendingCount} waiting for you` : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (!activePeer) return "No longer reachable";
  return activePeer.source === "network"
    ? "On your Wi-Fi · connected directly"
    : "Joined by room code";
}
