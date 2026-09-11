import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DownloadSimple as ArrowDownToLine } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { ArrowsLeftRight as ArrowRightLeft } from "@phosphor-icons/react/dist/csr/ArrowsLeftRight";
import { CaretLeft as ChevronLeft } from "@phosphor-icons/react/dist/csr/CaretLeft";
import { ChatCircle as MessageSquare } from "@phosphor-icons/react/dist/csr/ChatCircle";
import { ShieldCheck } from "@phosphor-icons/react/dist/csr/ShieldCheck";
import { WifiHigh as Wifi } from "@phosphor-icons/react/dist/csr/WifiHigh";

import { CopyButton } from "@/components/interior/copy-button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import type { ConnectionStatus } from "./coordinator";
import { NewItemsPill } from "@/components/interior/new-items-pill";
import { Button } from "@/components/ui/button";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { IncomingRow, MessageRow, OutgoingRow } from "./EventRow";
import { FileIcon } from "./FileIcon";
import { formatBytes } from "./transfer";
import {
  EVERYONE,
  type IncomingItem,
  type OutgoingItem,
  type ThreadEvent,
} from "./useSession";

/** How close to the bottom still counts as "following the conversation". */
const PINNED_SLACK_PX = 48;

interface ThreadProps {
  threadId: string;
  title: string;
  subtitle: string;
  events: ThreadEvent[];
  received: IncomingItem[];
  labels: Record<string, string>;
  canVerify: boolean;
  onApprove: (item: IncomingItem) => void;
  onDecline: (item: IncomingItem) => void;
  onVerify: () => void;
  onHistory: () => void;
  onBack: () => void;
  peerCount: number;
  candidateCount: number;
  status: ConnectionStatus;
  code: string;
  onRoom: () => void;
  onRetry: () => void;
  verified: boolean;
}

/** Rows are events, except consecutive outgoing items of one fan-out. */
type Row =
  | {
      key: string;
      kind: "message";
      event: Extract<ThreadEvent, { kind: "message" }>;
    }
  | {
      key: string;
      kind: "incoming";
      event: Extract<ThreadEvent, { kind: "incoming" }>;
    }
  | { key: string; kind: "outgoing"; items: OutgoingItem[] };

export function Thread(props: ThreadProps) {
  const {
    threadId,
    title,
    subtitle,
    events,
    received,
    labels,
    canVerify,
    onApprove,
    onDecline,
    onVerify,
    onHistory,
    onBack,
    peerCount,
    candidateCount,
    status,
    code,
    onRoom,
    onRetry,
    verified,
  } = props;

  const [connectionSlow, setConnectionSlow] = useState(false);
  useEffect(() => {
    setConnectionSlow(false);
    if (peerCount || !candidateCount) return;
    const timer = setTimeout(() => setConnectionSlow(true), 15_000);
    return () => clearTimeout(timer);
  }, [peerCount, candidateCount]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pinnedRef = useRef(true);
  const previousCount = useRef(0);
  const [adrift, setAdrift] = useState(false);
  const [missed, setMissed] = useState(0);

  const rows = useMemo<Row[]>(() => {
    const filtered =
      threadId === EVERYONE
        ? events
        : events.filter((event) => event.peerIds.includes(threadId));

    const out: Row[] = [];
    const groupIndex = new Map<string, number>();

    for (const event of filtered) {
      if (event.kind === "message") {
        out.push({ key: event.id, kind: "message", event });
        continue;
      }
      if (event.kind === "incoming") {
        out.push({ key: event.id, kind: "incoming", event });
        continue;
      }
      // Collapse a fan-out only where several recipients are visible.
      // Inside one person's thread the group is that person alone.
      const groupKey = event.item.groupId;
      const existing = groupIndex.get(groupKey);
      if (existing !== undefined) {
        const row = out[existing];
        if (row.kind === "outgoing") row.items.push(event.item);
        continue;
      }
      groupIndex.set(groupKey, out.length);
      out.push({ key: groupKey, kind: "outgoing", items: [event.item] });
    }
    return out;
  }, [events, threadId]);

  const visibleRows = threadId === "received" ? received.length : rows.length;

  const jumpToNewest = (smooth = true) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    pinnedRef.current = true;
    setAdrift(false);
    setMissed(0);
  };

  // Opening a conversation starts at the newest, the way every messaging
  // client does. Layout effect so it happens before paint, with no jump.
  useLayoutEffect(() => {
    previousCount.current = visibleRows;
    jumpToNewest(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  // Follow new activity while the reader is at the bottom. When they have
  // scrolled up, count what they missed instead of yanking them back:
  // losing your place mid-read is worse than a delayed autoscroll.
  useEffect(() => {
    const grew = visibleRows - previousCount.current;
    previousCount.current = visibleRows;
    if (grew <= 0) return;
    if (pinnedRef.current) jumpToNewest();
    else setMissed((count) => count + grew);
  }, [visibleRows]);

  const onScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < PINNED_SLACK_PX;
    pinnedRef.current = atBottom;
    setAdrift(!atBottom);
    if (atBottom) setMissed(0);
  };

  const body =
    threadId === "received" ? (
      received.length === 0 ? (
        <Empty className="thread-empty max-w-md flex-none gap-4">
          <EmptyHeader>
            <EmptyMedia
              variant="icon"
              className="size-14 bg-transparent text-[var(--bj-acc-text)] [&_svg]:size-8"
            >
              <ArrowDownToLine
                className="size-6"
                weight="duotone"
                aria-hidden="true"
              />
            </EmptyMedia>
            <EmptyTitle
              role="heading"
              aria-level={3}
              className="text-[1.75rem] leading-tight font-medium tracking-[-.04em] max-w-[22rem]"
            >
              Your received files, all together
            </EmptyTitle>
            <EmptyDescription>
              Files you accept will appear here. Your browser saves them to your
              downloads folder.
            </EmptyDescription>
          </EmptyHeader>
          <p className="empty-note">This list lasts until you close the tab.</p>
        </Empty>
      ) : (
        <ul className="rows" aria-label="Conversation events">
          {received.map((item) => (
            <li className="row" key={item.requestId}>
              <div className="row-meta">
                <span className="row-who">
                  {labels[item.from] ?? item.fromName}
                </span>
                <time dateTime={new Date(item.at).toISOString()}>
                  {new Date(item.at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>
              <Card className="card is-done">
                <CardHeader className="card-head flex items-center gap-3">
                  <span className="card-icon">
                    <FileIcon
                      name={item.name}
                      folder={Boolean(item.note)}
                      size={18}
                    />
                  </span>
                  <span className="card-name">{item.name}</span>
                  <span className="card-size">{formatBytes(item.size)}</span>
                </CardHeader>
                <CardFooter className="card-foot justify-between gap-3">
                  <span className="card-state">
                    Transfer complete. Check your downloads.
                  </span>
                </CardFooter>
              </Card>
            </li>
          ))}
        </ul>
      )
    ) : rows.length === 0 ? (
      <Empty className="thread-empty max-w-md flex-none gap-4">
        <EmptyHeader>
          <EmptyMedia
            variant="icon"
            className="size-14 bg-transparent text-[var(--bj-acc-text)] [&_svg]:size-8"
          >
            {threadId === EVERYONE ? (
              <Wifi className="size-6" weight="regular" aria-hidden="true" />
            ) : (
              <MessageSquare
                className="size-6"
                weight="duotone"
                aria-hidden="true"
              />
            )}
          </EmptyMedia>
          <EmptyTitle
            role="heading"
            aria-level={3}
            className="text-[1.75rem] leading-tight font-medium tracking-[-.04em] max-w-[22rem]"
          >
            {threadId === EVERYONE
              ? peerCount > 0
                ? "A little closer. A lot easier."
                : code
                  ? "Your room is ready."
                  : "Share something with someone nearby."
              : `Say hello to ${title}`}
          </EmptyTitle>
          <EmptyDescription>
            {threadId === EVERYONE
              ? peerCount > 0
                ? `You’re connected to ${peerCount === 1 ? "one person" : `${peerCount} people`}. Say hello or choose a file below.`
                : code
                  ? "Invite someone on your Wi-Fi with your room code. You can start sharing as soon as they join."
                  : "Open Bonjou on another device using the same Wi-Fi. They’ll appear here when a direct connection is ready."
              : "Messages and file offers in this conversation go only to this person."}
          </EmptyDescription>
        </EmptyHeader>
        {threadId === EVERYONE && peerCount === 0 ? (
          <>
            <div className="empty-actions">
              <CopyButton
                value={`${window.location.origin}${code ? `/r/${code}` : "/app"}`}
                label={code ? "Copy room link" : "Copy app link"}
                className="h-11 px-5"
              />
              <Button
                type="button"
                variant="outline"
                className="h-11 px-5"
                onClick={onRoom}
              >
                {code ? "Show room code" : "Create or join a room"}
              </Button>
            </div>
            <p className="connection-note" role="status">
              {status === "reconnecting" || status === "closed"
                ? "Connection lost. Trying again…"
                : connectionSlow
                  ? "A nearby device was found, but the direct connection has not opened."
                  : status !== "connected"
                    ? "Connecting to Bonjou…"
                    : "Ready. Keep this tab open."}
            </p>
            <Accordion
              type="single"
              collapsible
              className="connection-help w-full max-w-sm text-left"
            >
              <AccordionItem value="help" className="border-0">
                <AccordionTrigger className="justify-center gap-2 text-sm">
                  Not seeing the other device?
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed">
                  <p>
                    Check that both devices use the same Wi-Fi and have Bonjou
                    open. Guest Wi-Fi, VPNs, or local-network permissions can
                    prevent a direct connection. A room code cannot bypass a
                    blocked network.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4 h-11"
                    onClick={onRetry}
                  >
                    Try connecting again
                  </Button>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </>
        ) : (
          <p className="empty-note">Every file is theirs to accept.</p>
        )}
      </Empty>
    ) : (
      <ul className="rows" aria-label="Conversation events">
        {rows.map((row) => {
          if (row.kind === "message") {
            return (
              <MessageRow
                key={row.key}
                line={row.event.line}
                label={labels[row.event.peerIds[0]] ?? row.event.line.from}
              />
            );
          }
          if (row.kind === "incoming") {
            return (
              <IncomingRow
                key={row.key}
                item={row.event.item}
                label={labels[row.event.item.from] ?? row.event.item.fromName}
                onApprove={onApprove}
                onDecline={onDecline}
              />
            );
          }
          return (
            <OutgoingRow key={row.key} items={row.items} labels={labels} />
          );
        })}
      </ul>
    );

  return (
    <section className="thread" aria-label={title}>
      <header className="thread-head">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="thread-back size-11 hidden max-[860px]:inline-flex"
          onClick={onBack}
          aria-label="Back to the list"
        >
          <ChevronLeft
            size={18}
            className="size-[1.125rem]"
            aria-hidden="true"
          />
        </Button>

        <div className="thread-title">
          <div className="flex items-center gap-2">
            <h2>{title}</h2>
            {verified ? (
              <Badge variant="outline" className="text-[var(--bj-live)]">
                Verified
              </Badge>
            ) : null}
          </div>
          <p>{subtitle}</p>
        </div>

        <div className="thread-tools">
          {/*
            The labels are wrapped so a narrow viewport can drop them and
            leave the icons, which is the only way two controls and a title
            fit across 390px.
          */}
          {canVerify ? (
            <Button
              type="button"
              variant="ghost"
              className="h-11 px-3"
              onClick={onVerify}
              aria-label="Verify security fingerprint"
            >
              <ShieldCheck
                size={18}
                className="size-[1.125rem]"
                aria-hidden="true"
              />
              <span>{verified ? "Verified" : "Verify"}</span>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            className="h-11 px-3"
            onClick={onHistory}
            aria-label="This session's transfers"
          >
            <ArrowRightLeft
              size={18}
              className="size-[1.125rem]"
              aria-hidden="true"
            />
            <span>Transfers</span>
          </Button>
        </div>
      </header>

      <div className="thread-scroll">
        <div
          className="thread-body bj-scroll"
          ref={scrollRef}
          onScroll={onScroll}
        >
          {body}
        </div>

        <NewItemsPill
          count={missed}
          visible={adrift}
          onJump={() => jumpToNewest()}
          className={missed > 0 ? "jump has-missed" : "jump"}
        />
      </div>
    </section>
  );
}
