import { Paperclip } from "@phosphor-icons/react/dist/csr/Paperclip";
import { FolderSimple } from "@phosphor-icons/react/dist/csr/FolderSimple";
import { UsersThree } from "@phosphor-icons/react/dist/csr/UsersThree";
import { ShieldCheck } from "@phosphor-icons/react/dist/csr/ShieldCheck";
import { GearSix } from "@phosphor-icons/react/dist/csr/GearSix";
import { ArrowsDownUp } from "@phosphor-icons/react/dist/csr/ArrowsDownUp";
import { CircleHalf } from "@phosphor-icons/react/dist/csr/CircleHalf";
import { DownloadSimple } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { Peer } from "./coordinator";
import { EVERYONE } from "./useSession";

interface PaletteProps {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  peers: Peer[];
  labels: Record<string, string>;
  canVerify: boolean;
  canSend: boolean;
  onSelectThread: (id: string) => void;
  onPickFiles: () => void;
  onPickFolder: () => void;
  onRoom: () => void;
  onVerify: () => void;
  onToggleTheme: () => void;
  onSettings: () => void;
  onTransfers: () => void;
}
export function Palette(props: PaletteProps) {
  const run = (action: () => void) => () => {
    props.onOpenChange(false);
    action();
  };
  const actions = [
    {
      label: "Send files to this thread",
      Icon: Paperclip,
      action: props.onPickFiles,
      disabled: !props.canSend,
    },
    {
      label: "Send a folder to this thread",
      Icon: FolderSimple,
      action: props.onPickFolder,
      disabled: !props.canSend,
    },
    { label: "Open or join a room", Icon: UsersThree, action: props.onRoom },
    {
      label: "Verify security fingerprint",
      Icon: ShieldCheck,
      action: props.onVerify,
      disabled: !props.canVerify,
    },
    {
      label: "Show this session's transfers",
      Icon: ArrowsDownUp,
      action: props.onTransfers,
    },
    {
      label: "Toggle light and dark",
      Icon: CircleHalf,
      action: props.onToggleTheme,
    },
    { label: "Open settings", Icon: GearSix, action: props.onSettings },
  ];
  return (
    <CommandDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title="Find a person or action"
      description="Search people, send files, or change your settings."
    >
      <CommandInput placeholder="Type a command or a name" />
      <CommandList className="max-h-[60dvh] [&_[cmdk-item]]:min-h-11 [&_[cmdk-item]]:gap-3">
        <CommandEmpty>No people or actions match that search.</CommandEmpty>
        <CommandGroup heading="Actions">
          {actions.map(({ label, Icon, action, disabled }) => (
            <CommandItem key={label} disabled={disabled} onSelect={run(action)}>
              <Icon aria-hidden="true" />
              {label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Conversations">
          <CommandItem onSelect={run(() => props.onSelectThread(EVERYONE))}>
            <UsersThree aria-hidden="true" />
            Everyone here
          </CommandItem>
          <CommandItem onSelect={run(() => props.onSelectThread("received"))}>
            <DownloadSimple aria-hidden="true" />
            Received files
          </CommandItem>
          {props.peers.map((peer) => (
            <CommandItem
              key={peer.id}
              value={`${props.labels[peer.id] ?? peer.name} ${peer.id}`}
              onSelect={run(() => props.onSelectThread(peer.id))}
            >
              <Avatar className="size-7" aria-hidden="true">
                <AvatarFallback>
                  {peer.name.slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {props.labels[peer.id] ?? peer.name}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
