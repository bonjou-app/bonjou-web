import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
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
import { StagingTray } from "./StagingTray";
import { stageBatches, submitStage, type StagedBatch } from "./staging";

export interface ComposerRef {
  openFiles: () => void;
  openFolder: () => void;
  stageFiles: (files: File[], asFolder?: boolean) => void;
}

interface ComposerProps {
  threadId: string;
  targets: string[];
  destination: string;
  recipientNames?: string[];
  draft: string;
  onDraft: (value: string) => void;
  onSendText: (targets: string[], text: string) => Promise<boolean>;
  onSendFiles: (
    targets: string[],
    files: File[],
    asFolder?: boolean,
  ) => Promise<void>;
}

export const Composer = forwardRef<ComposerRef, ComposerProps>(
  function Composer(
    {
      threadId,
      targets,
      destination,
      recipientNames,
      draft,
      onDraft,
      onSendText,
      onSendFiles,
    }: ComposerProps,
    ref,
  ) {
    const [sending, setSending] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [error, setError] = useState("");
    const [chatError, setChatError] = useState<{
      threadId: string;
      message: string;
    } | null>(null);
    const [batches, setBatches] = useState<StagedBatch[]>([]);
    const [reading, setReading] = useState(0);
    const [offering, setOffering] = useState(false);
    const [stageNotice, setStageNotice] = useState("");
    const [discardedStage, setDiscardedStage] = useState<{
      batches: StagedBatch[];
      focusId: string;
      label: string;
    } | null>(null);
    const composerRef = useRef<HTMLDivElement>(null);
    const stageFocus = useRef<string | null>(null);
    const areaRef = useRef<HTMLTextAreaElement>(null);
    const filesRef = useRef<HTMLInputElement>(null);
    const folderRef = useRef<HTMLInputElement>(null);
    const nextBatch = useRef(0);
    const stageEpoch = useRef(0);
    const offeringRef = useRef(false);
    const depth = useRef(0);
    const canSend = targets.length > 0;
    const visibleError =
      error || (chatError?.threadId === threadId ? chatError.message : "");
    const stageFiles = useCallback((files: File[], folder = false) => {
      if (offeringRef.current || !files.length) return;
      try {
        const next = stageBatches(files, folder, () =>
          String(nextBatch.current++),
        );
        setBatches((current) => [...current, ...next]);
        setDiscardedStage(null);
        setError("");
        setStageNotice("");
        areaRef.current?.focus({ preventScroll: true });
      } catch {
        setError("Could not stage those files. Try choosing them again.");
      }
    }, []);
    useImperativeHandle(
      ref,
      () => ({
        openFiles: () => filesRef.current?.click(),
        openFolder: () => folderRef.current?.click(),
        stageFiles,
      }),
      [stageFiles],
    );
    useEffect(
      () => () => {
        stageEpoch.current += 1;
      },
      [],
    );
    const fit = useCallback(() => {
      const el = areaRef.current;
      if (!el || !el.offsetWidth) return;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
    }, []);
    useEffect(fit, [draft, fit]);
    useEffect(() => {
      const id = stageFocus.current;
      if (id === null) return;
      stageFocus.current = null;
      const button = [
        ...(composerRef.current?.querySelectorAll<HTMLButtonElement>(
          "[data-stage-remove]",
        ) ?? []),
      ].find((element) => element.dataset.stageRemove === id);
      (button ?? filesRef.current)?.focus({ preventScroll: true });
    }, [batches]);
    useEffect(() => {
      const el = areaRef.current;
      if (!el) return;
      const observer = new ResizeObserver(fit);
      observer.observe(el);
      return () => observer.disconnect();
    }, [fit]);

    const send = async () => {
      if (!canSend || sending || offeringRef.current || !draft.trim()) return;
      setSending(true);
      setChatError(null);
      try {
        if (await onSendText(targets, draft)) onDraft("");
        else
          setChatError({
            threadId,
            message:
              "That message could not be sent. Your draft is still here.",
          });
      } catch {
        setChatError({
          threadId,
          message: "That message could not be sent. Try again.",
        });
      } finally {
        setSending(false);
        areaRef.current?.focus();
      }
    };
    const clearStage = () => {
      if (offeringRef.current) return;
      stageEpoch.current += 1;
      setDiscardedStage(
        batches.length
          ? {
              batches: [...batches],
              focusId: batches[0].id,
              label: "Undo clearing staged files",
            }
          : null,
      );
      setBatches([]);
      setReading(0);
      setError("");
      setStageNotice("Staged files cleared. Nothing was offered.");
      areaRef.current?.focus({ preventScroll: true });
    };
    const removeBatch = (id: string) => {
      if (offeringRef.current) return;
      const index = batches.findIndex((batch) => batch.id === id);
      if (index < 0) return;
      setDiscardedStage({
        batches: [...batches],
        focusId: id,
        label: "Undo file removal",
      });
      stageFocus.current =
        batches[index + 1]?.id ?? batches[index - 1]?.id ?? "";
      setBatches(batches.filter((batch) => batch.id !== id));
      setError("");
      setStageNotice(`${batches[index].name} removed. Nothing was offered.`);
    };
    const undoDiscard = () => {
      if (!discardedStage || offeringRef.current) return;
      stageFocus.current = discardedStage.focusId;
      setBatches(discardedStage.batches);
      setDiscardedStage(null);
      setError("");
      setStageNotice("Staged files restored. Nothing was offered.");
    };
    const offer = async () => {
      if (
        !canSend ||
        sending ||
        reading ||
        offeringRef.current ||
        !batches.length
      )
        return;
      offeringRef.current = true;
      setDiscardedStage(null);
      setOffering(true);
      setError("");
      const epoch = stageEpoch.current;
      const result = await submitStage([...batches], [...targets], onSendFiles);
      if (epoch !== stageEpoch.current) return;
      const submitted = new Set(result.submitted);
      setBatches((current) =>
        current.filter((batch) => !submitted.has(batch.id)),
      );
      if (result.error)
        setError(`${result.error} Unoffered files are still staged.`);
      else
        setStageNotice(
          "File requests are in the conversation. Downloads still need approval.",
        );
      offeringRef.current = false;
      setOffering(false);
      areaRef.current?.focus({ preventScroll: true });
    };
    return (
      <div
        ref={composerRef}
        className="composer"
        onPaste={(event) => {
          const files = [...event.clipboardData.items]
            .filter((item) => item.kind === "file")
            .map((item) => item.getAsFile())
            .filter((file): file is File => Boolean(file));
          if (!files.length) return;
          event.preventDefault();
          stageFiles(files);
        }}
      >
        {batches.length > 0 || reading > 0 ? (
          <StagingTray
            batches={batches}
            reading={reading > 0}
            offering={offering}
            destination={destination}
            recipientNames={recipientNames}
            canOffer={canSend && !sending}
            onClear={clearStage}
            onRemove={removeBatch}
            onOffer={() => void offer()}
          />
        ) : null}
        <InputGroup
          className={`composer-box mx-auto max-w-4xl rounded-xl bg-background shadow-xs has-disabled:opacity-100 has-disabled:bg-background dark:has-disabled:bg-background ${dragging ? "ring-2 ring-primary" : ""}`}
          onDragEnter={(event) => {
            event.preventDefault();
            depth.current++;
            if (!offeringRef.current) setDragging(true);
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
            if (offeringRef.current) return;
            const epoch = stageEpoch.current;
            setReading((count) => count + 1);
            setDiscardedStage(null);
            setStageNotice("");
            void fromDataTransfer(event.dataTransfer)
              .then(({ files, asFolder }) => {
                if (epoch === stageEpoch.current) stageFiles(files, asFolder);
              })
              .catch((error: unknown) => {
                if (epoch !== stageEpoch.current) return;
                setError(
                  error instanceof Error
                    ? error.message
                    : "Could not read that drop. Use the file picker instead.",
                );
              })
              .finally(() => {
                if (epoch === stageEpoch.current)
                  setReading((count) => Math.max(0, count - 1));
              });
          }}
        >
          <InputGroupTextarea
            ref={areaRef}
            className="min-h-16 max-h-[min(10.5rem,22dvh)] overflow-y-auto px-4 pt-4 pb-2 text-base leading-relaxed"
            value={draft}
            onChange={(event) => onDraft(event.target.value)}
            placeholder="Write a message…"
            aria-label={`Message ${destination}`}
            aria-describedby={visibleError ? "composer-error" : undefined}
            readOnly={sending || offering}
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
              <label aria-disabled={offering}>
                <Paperclip size={18} aria-hidden="true" /> <span>Files</span>
                <Input
                  type="file"
                  ref={filesRef}
                  multiple
                  disabled={offering}
                  onChange={(event) => {
                    const files = [...(event.target.files ?? [])];
                    stageFiles(files);
                    event.target.value = "";
                  }}
                />
              </label>
            </Button>
            <Button asChild variant="ghost" className="attach h-11 px-3">
              <label aria-disabled={offering}>
                <FolderSimple size={18} aria-hidden="true" />{" "}
                <span>Folder</span>
                <Input
                  type="file"
                  ref={folderRef}
                  multiple
                  disabled={offering}
                  {...({ webkitdirectory: "", directory: "" } as Record<
                    string,
                    string
                  >)}
                  onChange={(event) => {
                    const files = [...(event.target.files ?? [])];
                    stageFiles(files, true);
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
              disabled={!canSend || !draft.trim() || sending || offering}
              onClick={() => void send()}
              aria-label={sending ? "Sending message" : "Send message"}
            >
              <ArrowUp size={20} aria-hidden="true" />
            </Button>
          </InputGroupAddon>
          {dragging ? (
            <div className="composer-drop" aria-hidden="true">
              Drop to stage files
            </div>
          ) : null}
        </InputGroup>
        <div className="composer-footer">
          <span>
            {canSend
              ? `To ${destination}`
              : "Stage files while you wait for people."}
          </span>
          <span className="composer-hint">
            Enter to send <span aria-hidden="true">·</span> Shift + Enter for a
            new line
          </span>
        </div>
        {stageNotice ? (
          <div
            className="staging-feedback flex items-center gap-2"
            role="status"
          >
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
              {stageNotice}
            </span>
            {discardedStage ? (
              <Button
                type="button"
                variant="ghost"
                className="h-11 shrink-0 px-3"
                aria-label={discardedStage.label}
                onClick={undoDiscard}
                disabled={offering}
              >
                Undo
              </Button>
            ) : null}
          </div>
        ) : null}
        {visibleError ? (
          <p className="composer-error" id="composer-error" role="alert">
            {visibleError}
          </p>
        ) : null}
      </div>
    );
  },
);
