import { useEffect, useState, type ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check } from "@phosphor-icons/react/dist/csr/Check";
import { Sun } from "@phosphor-icons/react/dist/csr/Sun";
import { Moon } from "@phosphor-icons/react/dist/csr/Moon";
import { Desktop } from "@phosphor-icons/react/dist/csr/Desktop";
import { UsersThree } from "@phosphor-icons/react/dist/csr/UsersThree";
import { SignIn } from "@phosphor-icons/react/dist/csr/SignIn";
import { ShieldCheck } from "@phosphor-icons/react/dist/csr/ShieldCheck";

import { CopyButton } from "@/components/interior/copy-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Item,
  ItemContent,
  ItemMedia,
  ItemTitle,
  ItemDescription,
  ItemActions,
} from "@/components/ui/item";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldContent,
  FieldGroup,
  FieldSeparator,
} from "@/components/ui/field";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { FileIcon } from "./FileIcon";
import { formatBytes } from "./transfer";
import type { Settings } from "./settings";
import type { ThemeChoice } from "./theme";
import type { IncomingItem, OutgoingItem, ThreadEvent } from "./useSession";

/* ------------------------------------------------------------------ */
/* Shared shells                                                       */
/* ------------------------------------------------------------------ */

/** A drawer against the right edge. Settings and Transfers both use it. */
function SidePanel({
  open,
  onOpenChange,
  title,
  note,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="side-panel data-[side=right]:w-full data-[side=right]:sm:max-w-md gap-0"
        side="right"
      >
        <SheetHeader className="border-b p-6 pr-12">
          <SheetTitle className="text-xl tracking-tight">{title}</SheetTitle>
          <SheetDescription>
            {note ?? "Make Bonjou feel at home on your device."}
          </SheetDescription>
        </SheetHeader>
        <div className="side-body bj-scroll min-h-0 flex-1 overflow-y-auto p-6">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** A centred modal. Verify and Room both use it. */
function Modal({
  open,
  onOpenChange,
  children,
  wide,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`modal max-h-[calc(100dvh-2rem)] overflow-y-auto gap-6 p-6 ${wide ? "sm:max-w-lg" : "sm:max-w-md"}`}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Verify                                                              */
/* ------------------------------------------------------------------ */

export function VerifyDialog({
  open,
  onOpenChange,
  peerName,
  fingerprint,
  verified,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  peerName: string;
  fingerprint: string;
  verified: boolean;
  onConfirm: () => void;
}) {
  // The session formats the fingerprint colon-separated ("c2:a8:..."),
  // and it is shown as eight separate tiles because reading a run of
  // sixteen hex characters aloud is exactly where people lose their place.
  const bytes = fingerprint ? fingerprint.split(/[\s:]+/).filter(Boolean) : [];

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <DialogHeader className="gap-3">
        <ShieldCheck size={28} weight="duotone" aria-hidden="true" />
        <DialogTitle className="text-xl tracking-tight">
          Compare your security codes
        </DialogTitle>
        <DialogDescription className="leading-relaxed">
          Ask {peerName} to open Verify too. Read these eight pairs to each
          other and check they match. This confirms you are connected to the
          right person.
        </DialogDescription>
      </DialogHeader>

      {bytes.length > 0 ? (
        <div className="fingerprint">
          {bytes.map((byte, index) => (
            <span key={`${byte}-${index}`}>{byte}</span>
          ))}
        </div>
      ) : (
        <p className="modal-lede">No key has arrived for this person yet.</p>
      )}

      <div className="modal-actions">
        {verified ? (
          <span className="verified-note">
            <Check size={18} className="size-[1.125rem]" aria-hidden="true" />
            You confirmed this key already
          </span>
        ) : null}
        <span className="spacer" />
        <DialogClose asChild>
          <Button type="button" variant="outline" className="h-10 px-4">
            Not now
          </Button>
        </DialogClose>
        <Button
          type="button"
          className="h-10 px-4"
          disabled={bytes.length === 0}
          onClick={() => {
            onConfirm();
            onOpenChange(false);
          }}
        >
          They match
        </Button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Room                                                                */
/* ------------------------------------------------------------------ */

export function RoomDialog({
  open,
  onOpenChange,
  code,
  onCreate,
  onJoin,
  onLeave,
  pending,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  code: string;
  onCreate: () => void;
  onJoin: (code: string) => void;
  onLeave: () => void;
  pending: boolean;
  error: string;
}) {
  const [entry, setEntry] = useState("");
  const link = code ? `${window.location.origin}/r/${code}` : "";

  return (
    <Modal open={open} onOpenChange={onOpenChange} wide>
      <DialogHeader className="gap-3">
        <div className="flex size-11 items-center justify-center rounded-lg bg-muted">
          <UsersThree size={26} weight="duotone" aria-hidden="true" />
        </div>
        <DialogTitle className="text-xl tracking-tight">
          {code ? "Invite people to your room" : "A room for your group"}
        </DialogTitle>
        <DialogDescription className="leading-relaxed">
          {code
            ? "Share this code or link with people on the same Wi-Fi. Messages and files in this room go only to its members."
            : "Create a room for a smaller conversation, or join with a code. Everyone needs to be on the same local network."}
        </DialogDescription>
      </DialogHeader>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {code ? (
        <>
          <div className="room-code">
            <code>{code}</code>
            <CopyButton value={code} label="Copy code" className="h-10 px-4" />
            <CopyButton value={link} label="Copy link" className="h-10 px-4" />
          </div>

          <div className="room-qr">
            {/*
              Fixed light plate in both themes. The format assumes dark
              modules on a light ground, and plenty of phone cameras will
              not read an inverted code at all, so this one thing does not
              follow the theme.
            */}
            <span className="qr-plate">
              <QRCodeSVG
                aria-label={`QR code to join room ${code}`}
                value={link}
                size={128}
                level="M"
                bgColor="#ffffff"
                fgColor="#101319"
              />
            </span>
            <p>
              Scan to join on another device. Connect it to the same Wi-Fi
              first.
            </p>
          </div>
          <div className="room-leave">
            <p className="text-sm text-muted-foreground">
              Finished with this group?
            </p>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={onLeave}
            >
              Leave room
            </Button>
          </div>
        </>
      ) : (
        <Tabs defaultValue="create" className="gap-5">
          <TabsList className="w-full group-data-horizontal/tabs:h-10">
            <TabsTrigger value="create" className="h-8">
              <UsersThree aria-hidden="true" />
              Create a room
            </TabsTrigger>
            <TabsTrigger value="join" className="h-8">
              <SignIn aria-hidden="true" />
              Join a room
            </TabsTrigger>
          </TabsList>
          <TabsContent value="create" className="space-y-5">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Start a private space, then invite people with a link or QR code.
            </p>
            <Button
              type="button"
              className="h-11 w-full"
              onClick={onCreate}
              disabled={pending}
            >
              {pending ? "Creating room…" : "Open a room"}
            </Button>
          </TabsContent>
          <TabsContent value="join">
            <form
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                const value = entry.trim();
                if (value && !pending) onJoin(value);
              }}
            >
              <Field>
                <FieldLabel htmlFor="room-code">Room code</FieldLabel>
                <Input
                  id="room-code"
                  className="h-11 font-mono text-base"
                  value={entry}
                  onChange={(event) =>
                    setEntry(event.target.value.toUpperCase())
                  }
                  placeholder="ABC-234"
                  maxLength={7}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  disabled={pending}
                  aria-invalid={Boolean(error)}
                  aria-label="Room code"
                />
              </Field>
              <Button
                type="submit"
                className="h-11 w-full"
                disabled={!entry.trim() || pending}
              >
                {pending ? "Joining…" : "Join"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export function SettingsPanel({
  open,
  onOpenChange,
  name,
  onName,
  themeChoice,
  onTheme,
  settings,
  onSetting,
  onEnableNotifications,
  sentBytes,
  receivedBytes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  onName: (value: string) => void;
  themeChoice: ThemeChoice;
  onTheme: (choice: ThemeChoice) => void;
  settings: Settings;
  onSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  onEnableNotifications: () => Promise<boolean>;
  sentBytes: number;
  receivedBytes: number;
}) {
  const [draft, setDraft] = useState(name);
  const [denied, setDenied] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => setDraft(name), [name, open]);

  return (
    <SidePanel open={open} onOpenChange={onOpenChange} title="Settings">
      <FieldGroup>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const value = draft.trim();
            if (value && value !== name) {
              onName(value);
              setSaved(true);
            }
          }}
        >
          <Field>
            <FieldLabel htmlFor="settings-name">Name others see</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="settings-name"
                className="h-10 min-w-0"
                value={draft}
                maxLength={64}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setSaved(false);
                }}
              />
              <Button
                type="submit"
                variant="outline"
                className="h-10 px-4"
                disabled={!draft.trim() || draft.trim() === name}
              >
                Save
              </Button>
            </div>
            <FieldDescription role="status">
              {saved
                ? "Name saved. Connected people can see the update."
                : "Remembered on this device. Visible to connected people."}
            </FieldDescription>
          </Field>
        </form>
        <FieldSeparator />
        <Field>
          <FieldLabel>Appearance</FieldLabel>
          <ToggleGroup
            type="single"
            value={themeChoice}
            onValueChange={(value) => value && onTheme(value as ThemeChoice)}
            variant="outline"
            spacing={2}
            className="w-full"
            aria-label="Theme"
          >
            {(["light", "dark", "system"] as ThemeChoice[]).map((option) => (
              <ToggleGroupItem
                key={option}
                value={option}
                className="flex-1 h-11 gap-2"
              >
                {option === "light" ? (
                  <Sun aria-hidden="true" />
                ) : option === "dark" ? (
                  <Moon aria-hidden="true" />
                ) : (
                  <Desktop aria-hidden="true" />
                )}
                {option === "light"
                  ? "Light"
                  : option === "dark"
                    ? "Dark"
                    : "System"}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>

        <Toggle
          label="Compact rows"
          note="Tighter spacing, for watching a busy room on a small screen."
          on={settings.compact}
          onChange={(value) => onSetting("compact", value)}
        />
        <FieldSeparator />
        <Toggle
          label="File offer notifications"
          note={
            denied
              ? "Your browser has blocked notifications for this site."
              : "Only fires while this tab is in the background."
          }
          on={settings.notifyOffers}
          onChange={(value) => {
            if (!value) {
              onSetting("notifyOffers", false);
              return;
            }
            void onEnableNotifications().then((granted) => setDenied(!granted));
          }}
        />

        <FieldSeparator />
        <Field>
          <FieldLabel>This session</FieldLabel>
          <dl className="totals rounded-lg border bg-muted/50 p-4">
            <div>
              <dt>Sent</dt>
              <dd>{formatBytes(sentBytes)}</dd>
            </div>
            <div>
              <dt>Received</dt>
              <dd>{formatBytes(receivedBytes)}</dd>
            </div>
            <div>
              <dt>Kept on a server</dt>
              <dd className="is-accent">0 bytes</dd>
            </div>
          </dl>
        </Field>
      </FieldGroup>
    </SidePanel>
  );
}

function Toggle({
  label,
  note,
  on,
  onChange,
}: {
  label: string;
  note: string;
  on: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = `setting-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <Field orientation="horizontal" className="items-start">
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <FieldDescription>{note}</FieldDescription>
      </FieldContent>
      <Switch
        className="mt-0.5"
        id={id}
        checked={on}
        onCheckedChange={onChange}
      />
    </Field>
  );
}

/* ------------------------------------------------------------------ */
/* Transfers                                                           */
/* ------------------------------------------------------------------ */

interface HistoryEntry {
  key: string;
  name: string;
  line: string;
  size: number;
  status: string;
  tone: "default" | "success" | "warning";
  at: number;
  folder: boolean;
}

export function transferHistory(
  events: ThreadEvent[],
  labels: Record<string, string>,
): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  const groups = new Map<string, { items: OutgoingItem[]; at: number }>();

  for (const event of events) {
    if (event.kind === "incoming") {
      const item: IncomingItem = event.item;

      out.push({
        key: item.requestId,
        name: item.name,
        line: `From ${labels[item.from] ?? item.fromName}`,
        size: item.size,
        status: {
          pending: "Awaiting your approval",
          approved: "Starting",
          receiving: "Receiving",
          verifying: "Checking file",
          done: "Received",
          failed: "Failed",
          declined: "Declined",
        }[item.state],
        tone:
          item.state === "done"
            ? "success"
            : item.state === "failed"
              ? "warning"
              : "default",
        at: item.at,
        folder: Boolean(item.note),
      });
      continue;
    }
    if (event.kind !== "outgoing") continue;
    const group = groups.get(event.item.groupId);
    if (group) group.items.push(event.item);
    else groups.set(event.item.groupId, { items: [event.item], at: event.at });
  }

  for (const [groupId, { items, at }] of groups) {
    const names = items.map((i) => labels[i.peerId] ?? i.peerName);
    const failed = items.filter(
      (i) => i.state === "failed" || i.state === "declined",
    );
    out.push({
      key: groupId,
      name: items[0].label,
      line:
        failed.length === items.length
          ? `${failed[0].state === "declined" ? "Declined by" : "Failed to"} ${names.join(", ")}`
          : `To ${names.join(", ")}`,
      size: items[0].size,
      status: items.every((i) => i.state === "done")
        ? "Sent"
        : [
            ["sending", "sending"],
            ["offered", "waiting"],
            ["done", "sent"],
            ["declined", "declined"],
            ["failed", "failed"],
          ]
            .map(([state, label]) => {
              const count = items.filter((i) => i.state === state).length;
              return count ? `${count} ${label}` : "";
            })
            .filter(Boolean)
            .join(" · "),
      tone: items.every((i) => i.state === "done")
        ? "success"
        : items.some((i) => i.state === "failed")
          ? "warning"
          : "default",
      at,
      folder: Boolean(items[0].folder),
    });
  }

  return out.sort((a, b) => b.at - a.at);
}

export function TransfersPanel({
  open,
  onOpenChange,
  entries,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: HistoryEntry[];
}) {
  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      title="Transfers"
      note="This session only. Closing the tab forgets all of it."
    >
      {entries.length === 0 ? (
        <Alert className="empty">
          <AlertDescription>Nothing has moved yet.</AlertDescription>
        </Alert>
      ) : (
        <ul className="history">
          {entries.map((entry) => (
            <li key={entry.key}>
              <Item className="w-full gap-3 rounded-none border-0 px-0 py-4 items-start">
                <ItemMedia variant="icon">
                  <FileIcon name={entry.name} folder={entry.folder} size={24} />
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle className="break-all">{entry.name}</ItemTitle>
                  <ItemDescription>{entry.line}</ItemDescription>
                  <Badge
                    variant="secondary"
                    className={`w-fit mt-1 transfer-status is-${entry.tone}`}
                  >
                    {entry.status}
                  </Badge>
                </ItemContent>
                <ItemActions className="flex-col items-end gap-1 text-xs text-muted-foreground">
                  <span className="font-mono">{formatBytes(entry.size)}</span>
                  <time dateTime={new Date(entry.at).toISOString()}>
                    {new Date(entry.at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </ItemActions>
              </Item>
            </li>
          ))}
        </ul>
      )}
    </SidePanel>
  );
}
