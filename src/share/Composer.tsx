import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp } from "@phosphor-icons/react/dist/csr/ArrowUp";
import { FolderSimple } from "@phosphor-icons/react/dist/csr/FolderSimple";
import { Paperclip } from "@phosphor-icons/react/dist/csr/Paperclip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { fromDataTransfer } from "./dropped";

interface ComposerProps {
  targets: string[];
  destination: string;
  draft: string;
  onDraft: (value: string) => void;
  onSendText: (targets: string[], text: string) => Promise<boolean>;
  onSendFiles: (
    targets: string[],
    files: File[],
    asFolder?: boolean,
  ) => Promise<void>;
}

export function Composer({
  targets,
  destination,
  draft,
  onDraft,
  onSendText,
  onSendFiles,
}: ComposerProps) {
  const [sending, setSending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const depth = useRef(0);
  const canSend = targets.length > 0;
  const fit = useCallback(() => {
    const el = areaRef.current;
    if (!el || !el.offsetWidth) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, []);
  useEffect(fit, [draft, fit]);
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [fit]);

  const send = async () => {
    if (!canSend || sending || !draft.trim()) return;
    setSending(true);
    setError("");
    try {
      if (await onSendText(targets, draft)) onDraft("");
      else
        setError("That message could not be sent. Your draft is still here.");
    } catch {
      setError("That message could not be sent. Try again.");
    } finally {
      setSending(false);
      areaRef.current?.focus();
    }
  };
  const offer = async (files: File[], folder = false) => {
    setError("");
    try {
      await onSendFiles(targets, files, folder);
    } catch {
      setError("Could not read those files. Try choosing them again.");
    }
  };
  return (
    <div className="composer">
      <InputGroup
        className={`composer-box mx-auto max-w-4xl rounded-xl bg-background shadow-xs ${canSend ? "has-disabled:opacity-100 has-disabled:bg-background dark:has-disabled:bg-background" : ""} ${dragging ? "ring-2 ring-primary" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          depth.current++;
          if (canSend) setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => {
          depth.current = Math.max(0, depth.current - 1);
          if (!depth.current) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          depth.current = 0;
          setDragging(false);
          if (!canSend) return;
          void fromDataTransfer(event.dataTransfer)
            .then(({ files, asFolder }) => offer(files, asFolder))
            .catch(() =>
              setError(
                "Could not read that drop. Use the file picker instead.",
              ),
            );
        }}
      >
        <InputGroupTextarea
          ref={areaRef}
          className="min-h-16 px-4 pt-4 pb-2 text-base leading-relaxed"
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          placeholder={`Message ${destination}…`}
          aria-label={`Message ${destination}`}
          aria-describedby={error ? "composer-error" : undefined}
          disabled={!canSend}
          readOnly={sending}
          maxLength={16_384}
          rows={1}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <InputGroupAddon align="block-end" className="gap-1 px-2 pb-2">
          <Button asChild variant="ghost" className="attach h-11 px-3">
            <label aria-disabled={!canSend}>
              <Paperclip size={18} aria-hidden="true" /> <span>Files</span>
              <Input
                type="file"
                multiple
                disabled={!canSend}
                onChange={(event) => {
                  const files = [...(event.target.files ?? [])];
                  if (files.length) void offer(files);
                  event.target.value = "";
                }}
              />
            </label>
          </Button>
          <Button asChild variant="ghost" className="attach h-11 px-3">
            <label aria-disabled={!canSend}>
              <FolderSimple size={18} aria-hidden="true" /> <span>Folder</span>
              <Input
                type="file"
                multiple
                disabled={!canSend}
                {...({ webkitdirectory: "", directory: "" } as Record<
                  string,
                  string
                >)}
                onChange={(event) => {
                  const files = [...(event.target.files ?? [])];
                  if (files.length) void offer(files, true);
                  event.target.value = "";
                }}
              />
            </label>
          </Button>
          <span className="spacer" />
          <Button
            type="button"
            className="size-11"
            size="icon"
            disabled={!canSend || !draft.trim() || sending}
            onClick={() => void send()}
            aria-label={sending ? "Sending message" : "Send message"}
          >
            <ArrowUp size={20} aria-hidden="true" />
          </Button>
        </InputGroupAddon>
        {dragging ? (
          <div className="composer-drop" aria-hidden="true">
            Drop to offer to {destination}
          </div>
        ) : null}
      </InputGroup>
      <div className="composer-footer">
        <span>To {destination}</span>
        <span className="composer-hint">
          Enter to send <span aria-hidden="true">·</span> Shift + Enter for a
          new line
        </span>
      </div>
      {error ? (
        <p className="composer-error" id="composer-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
