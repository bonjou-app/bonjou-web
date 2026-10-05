import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { ArrowClockwise } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { Check } from "@phosphor-icons/react/dist/csr/Check";
import { DownloadSimple } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { UploadSimple } from "@phosphor-icons/react/dist/csr/UploadSimple";
import { FileText } from "@phosphor-icons/react/dist/csr/FileText";
import { Table } from "@phosphor-icons/react/dist/csr/Table";
import { Image } from "@phosphor-icons/react/dist/csr/Image";
import svgDocument from "material-icon-theme/icons/document.svg?raw";
import svgTable from "material-icon-theme/icons/table.svg?raw";
import svgSvg from "material-icon-theme/icons/svg.svg?raw";
import svgFile from "material-icon-theme/icons/file.svg?raw";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { DemoTransferProgress, DemoTransferResult } from "./demoTransfer";

export type DemoSampleId = "notes" | "sheet" | "image";
type LabPhase =
  | "ready"
  | "offered"
  | "connecting"
  | "transferring"
  | "verifying"
  | "received"
  | "declined"
  | "cancelled"
  | "failed";
type ActionTarget = "approve" | "cancel" | "download" | "retry" | "offer";

interface HandoffLabProps {
  requestedSample?: { id: DemoSampleId; revision: number };
  onOpenApp?: () => void;
  onBusyChange?: (busy: boolean) => void;
}

const MAX_LOCAL_BYTES = 2 * 1024 * 1024;
const samples = [
  { id: "notes", label: "Field notes", icon: FileText },
  { id: "sheet", label: "Colour sheet", icon: Table },
  { id: "image", label: "Dot study", icon: Image },
] as const;

// The owned samples need only these exact upstream Material SVGs. Keep the
// complete filename resolver out of the homepage until a custom file needs it.
const sampleFileIcons = {
  notes: svgDocument,
  sheet: svgTable,
  image: svgSvg,
  waiting: svgFile,
};
const CustomFileIcon = lazy(async () => ({
  default: (await import("./FileIcon")).FileIcon,
}));

function LabFileIcon({
  sample,
  name,
  size,
  className,
}: {
  sample: DemoSampleId | "custom" | "waiting";
  name: string;
  size: number;
  className?: string;
}) {
  const leaf = (
    <span
      className={className ? `file-icon ${className}` : "file-icon"}
      style={{ width: size, height: size }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{
        __html: sampleFileIcons[sample === "custom" ? "waiting" : sample],
      }}
    />
  );
  return sample === "custom" ? (
    <Suspense fallback={leaf}>
      <CustomFileIcon name={name} size={size} className={className} />
    </Suspense>
  ) : (
    leaf
  );
}

/** Original, deterministic demo assets. They are made locally, never fetched. */
function sampleFile(id: DemoSampleId): File {
  if (id === "notes") {
    const opening =
      "FIELD NOTES\nA small collection for a nearby handoff.\n\nThis is an original Bonjou demonstration file, made in your browser.\n";
    const pages = Array.from(
      { length: 80 },
      (_, index) =>
        `\n${String(index + 1).padStart(2, "0")} / A little closer\n` +
        "A note for the next desk, a photograph from the same afternoon, a folder for tomorrow. " +
        "Ask before sending. Keep the destination clear. Check that the whole file arrived. " +
        "This page is sample text, not a conversation with another person.\n",
    ).join("");
    return new File([opening, pages], "field-notes.txt", {
      type: "text/plain;charset=utf-8",
      lastModified: 0,
    });
  }
  if (id === "sheet") {
    const rows = ["swatch,column,row,red,green,blue,hex"];
    for (let index = 0; index < 1100; index++) {
      const red = 40 + ((index * 17) % 180);
      const green = 45 + ((index * 11) % 170);
      const blue = 55 + ((index * 7) % 160);
      const hex = [red, green, blue]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
      rows.push(
        `sample-${String(index + 1).padStart(4, "0")},${index % 40},${Math.floor(index / 40)},${red},${green},${blue},#${hex}`,
      );
    }
    return new File([rows.join("\n") + "\n"], "colour-sheet.csv", {
      type: "text/csv;charset=utf-8",
      lastModified: 0,
    });
  }
  const marks: string[] = [];
  for (let row = 0; row < 24; row++)
    for (let column = 0; column < 40; column++) {
      const wave = Math.sin(column * 0.2 + row * 0.31);
      const radius = (2.4 + (wave + 1) * 1.8).toFixed(2);
      const fill =
        column > 17 && column < 24
          ? "#c94d38"
          : wave > 0.25
            ? "#6a7b80"
            : "#bdc7c3";
      marks.push(
        `<circle cx="${29 + column * 19}" cy="${25 + row * 17}" r="${radius}" fill="${fill}"/>`,
      );
    }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="440" viewBox="0 0 800 440"><title>Dot study</title><desc>An original wave of coloured dots, made as a Bonjou sample file.</desc><rect width="800" height="440" fill="#ecece3"/>${marks.join("")}</svg>`;
  return new File([svg], "dot-study.svg", {
    type: "image/svg+xml",
    lastModified: 0,
  });
}

function sizeLabel(bytes: number): string {
  if (bytes === 0) return "0 bytes";
  if (bytes < 1024) return `${bytes} bytes`;
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KiB`
    : `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

const phaseCopy: Record<LabPhase, string> = {
  ready: "Offer a file from the sending side to begin.",
  offered: "File offer ready. Approve or decline on the receiving side.",
  connecting: "Opening two local WebRTC connections in this browser.",
  transferring: "Counting the bytes as the receiving side gets them.",
  verifying: "Comparing SHA-256 hashes of the sent and received bytes.",
  received: "Every byte arrived. The two SHA-256 hashes match.",
  declined: "Offer declined. No file bytes were sent.",
  cancelled: "Transfer cancelled. Unfinished bytes were discarded.",
  failed: "The local demo could not finish. You can try again.",
};

/**
 * Public lab contract: the root exposes data-phase, data-sample,
 * data-received-bytes, data-total-bytes, and data-integrity for browser checks.
 * Transport code loads only after an explicit approval or approved retry.
 */
export function HandoffLab({
  requestedSample,
  onOpenApp,
  onBusyChange,
}: HandoffLabProps = {}) {
  const titleId = useId();
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const offerButton = useRef<HTMLButtonElement>(null);
  const approveButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const retryButton = useRef<HTMLButtonElement>(null);
  const downloadLink = useRef<HTMLAnchorElement>(null);
  const focusRequest = useRef<{
    target: ActionTarget;
    origin: Element | null;
  } | null>(null);
  const active = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const requestSeen = useRef("");
  const [sample, setSample] = useState<DemoSampleId | "custom">("notes");
  const [file, setFile] = useState(() => sampleFile("notes"));
  const [phase, setPhase] = useState<LabPhase>("ready");
  const [receivedBytes, setReceivedBytes] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DemoTransferResult | null>(null);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [posterUrl, setPosterUrl] = useState("");
  const busy =
    phase === "connecting" || phase === "transferring" || phase === "verifying";

  const stop = useCallback(() => {
    generation.current += 1;
    focusRequest.current = null;
    active.current?.abort(
      new DOMException("The visitor stopped the demo.", "AbortError"),
    );
    active.current = null;
  }, []);
  const reset = useCallback(() => {
    stop();
    setPhase("ready");
    setReceivedBytes(0);
    setError("");
    setResult(null);
  }, [stop]);
  const chooseSample = useCallback(
    (id: DemoSampleId) => {
      if (busy) return;
      reset();
      setSample(id);
      setFile(sampleFile(id));
      if (input.current) input.current.value = "";
    },
    [busy, reset],
  );

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  useEffect(() => {
    if (!requestedSample) return;
    const key = `${requestedSample.id}:${requestedSample.revision}`;
    if (requestSeen.current === key) return;
    requestSeen.current = key;
    // Requests received during a transfer are discarded rather than deferred.
    // Finishing the handoff must keep its verified result available to save.
    if (busy) return;
    chooseSample(requestedSample.id);
    focusRequest.current = {
      target: "offer",
      origin: document.activeElement,
    };
  }, [
    requestedSample?.id,
    requestedSample?.revision,
    busy,
    chooseSample,
    requestedSample,
  ]);
  useEffect(() => () => stop(), [stop]);
  useEffect(() => {
    // A page can return from the back/forward cache without remounting.
    const leave = () => reset();
    window.addEventListener("pagehide", leave);
    return () => window.removeEventListener("pagehide", leave);
  }, [reset]);
  useEffect(() => {
    if (!result) {
      setDownloadUrl("");
      return;
    }
    const url = URL.createObjectURL(result.blob);
    setDownloadUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [result]);
  useEffect(() => {
    if (sample !== "image") {
      setPosterUrl("");
      return;
    }
    // Only the original owned SVG gets a preview. Never inject chosen SVG text.
    const url = URL.createObjectURL(file);
    setPosterUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, sample]);
  useEffect(() => {
    const request = focusRequest.current;
    if (!request) return;
    // The received Blob URL is prepared by an effect. Keep this one request
    // until its action exists, then consume it whether or not focus moved.
    if (request.target === "approve" && phase !== "offered") return;
    if (
      request.target === "offer" &&
      phase !== "ready" &&
      phase !== "declined" &&
      phase !== "cancelled"
    )
      return;
    if (request.target === "cancel" && !busy) return;
    if (request.target === "retry" && phase !== "failed") return;
    if (request.target === "download" && phase !== "received") return;
    if (request.target === "download" && phase === "received" && !downloadUrl)
      return;
    const target =
      request.target === "approve"
        ? approveButton.current
        : request.target === "cancel"
          ? cancelButton.current
          : request.target === "download"
            ? downloadLink.current
            : request.target === "retry"
              ? retryButton.current
              : offerButton.current;
    focusRequest.current = null;
    const focused = document.activeElement;
    if (
      focused === request.origin ||
      (focused === document.body &&
        request.origin &&
        !request.origin.isConnected)
    )
      target?.focus({ preventScroll: true });
  }, [phase, downloadUrl, busy, requestedSample?.revision]);

  const requestFocus = (target: ActionTarget) => {
    focusRequest.current = { target, origin: document.activeElement };
  };
  const finishFocus = (target: "download" | "retry") => {
    const pending = focusRequest.current;
    const origin =
      pending?.target === "cancel" ? pending.origin : cancelButton.current;
    const focused = document.activeElement;
    // Follow the transfer action only. Moving to any other control, including
    // another control in this lab, ends the automatic focus handoff.
    if (
      focused === origin ||
      (focused === document.body && origin && !origin.isConnected)
    )
      requestFocus(target);
  };

  const offer = () => {
    reset();
    requestFocus("approve");
    setPhase("offered");
  };
  const approve = async () => {
    if (busy) return;
    stop();
    const run = generation.current;
    const controller = new AbortController();
    active.current = controller;
    requestFocus("cancel");
    setPhase("connecting");
    setReceivedBytes(0);
    setError("");
    setResult(null);
    try {
      const { runLocalDemo } = await import("./demoTransfer");
      if (controller.signal.aborted || generation.current !== run) return;
      const transferred = await runLocalDemo(file, {
        signal: controller.signal,
        onProgress: ({
          phase: next,
          receivedBytes: count,
        }: DemoTransferProgress) => {
          if (generation.current !== run || controller.signal.aborted) return;
          setPhase(next);
          setReceivedBytes(count);
        },
      });
      if (generation.current !== run || controller.signal.aborted) return;
      active.current = null;
      finishFocus("download");
      setResult(transferred);
      setReceivedBytes(transferred.size);
      setPhase("received");
    } catch (cause) {
      if (generation.current !== run || controller.signal.aborted) return;
      active.current = null;
      finishFocus("retry");
      setError(
        cause instanceof Error
          ? cause.message
          : "This browser could not complete the local demo.",
      );
      setPhase("failed");
    }
  };
  const decline = () => {
    stop();
    requestFocus("offer");
    setReceivedBytes(0);
    setResult(null);
    setError("");
    setPhase("declined");
  };
  const cancel = () => {
    stop();
    requestFocus("offer");
    setResult(null);
    setError("");
    setPhase("cancelled");
  };
  const chooseLocal = (next: File | undefined) => {
    if (!next) return;
    if (busy) {
      if (input.current) input.current.value = "";
      return;
    }
    if (next.size > MAX_LOCAL_BYTES) {
      setError(
        "Choose a file up to 2 MiB. This small demo keeps the whole received file in memory.",
      );
      if (input.current) input.current.value = "";
      return;
    }
    reset();
    setSample("custom");
    setFile(next);
    if (input.current) input.current.value = "";
  };

  const hasOffer = phase !== "ready";
  const currentStep =
    phase === "offered"
      ? 2
      : busy || phase === "received" || phase === "failed"
        ? 3
        : 1;
  const percent =
    phase === "received"
      ? 100
      : file.size
        ? Math.min(100, (receivedBytes / file.size) * 100)
        : 0;
  const receiverLabel =
    phase === "received"
      ? "Verified copy"
      : phase === "offered"
        ? "An offer for you"
        : busy
          ? "Receiving side"
          : "Nothing received yet";

  return (
    <div
      className="handoff-lab"
      ref={root}
      role="region"
      data-testid="handoff-lab"
      data-phase={phase}
      data-sample={sample}
      data-received-bytes={receivedBytes}
      data-total-bytes={file.size}
      data-integrity={result ? "verified" : "unverified"}
      aria-labelledby={titleId}
    >
      <div className="lab-heading-row">
        <h2 id={titleId}>
          <span className="lab-status-dot" aria-hidden="true" />
          Try a real handoff
        </h2>
        <p>Both sides run in this browser.</p>
      </div>
      <p className="lab-instruction">
        You play both sides: offer a file, approve it, then receive a verified
        copy.
      </p>
      <ol className="lab-steps" role="list" aria-label="Handoff steps">
        {["Offer", "Approve", "Receive"].map((label, index) => {
          const step = index + 1;
          const complete = phase === "received" || step < currentStep;
          const current = phase !== "received" && step === currentStep;
          return (
            <li
              key={label}
              data-state={complete ? "complete" : current ? "current" : "next"}
              aria-current={current ? "step" : undefined}
            >
              <span aria-hidden="true">{step}</span>
              {label}
              {complete ? (
                <>
                  <Check aria-hidden="true" />
                  <span className="bj-sr">, complete</span>
                </>
              ) : null}
            </li>
          );
        })}
      </ol>
      <div className="lab-source-row">
        <div
          className="lab-samples"
          role="group"
          aria-label="Choose an original sample file"
        >
          {samples.map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              variant={sample === id ? "secondary" : "ghost"}
              className="h-11 px-3 max-[760px]:px-2 max-[760px]:text-xs"
              aria-pressed={sample === id}
              data-sample-choice={id}
              disabled={busy}
              onClick={() => chooseSample(id)}
            >
              <Icon aria-hidden="true" />
              {label}
            </Button>
          ))}
        </div>
        <Button
          asChild
          variant="ghost"
          className={`lab-file-picker h-11 px-3${busy ? " pointer-events-none opacity-50" : ""}`}
        >
          <label aria-disabled={busy}>
            <UploadSimple aria-hidden="true" />
            <span>
              Your file <span className="lab-file-limit">≤ 2 MiB</span>
            </span>
            <input
              ref={input}
              type="file"
              className="bj-sr"
              disabled={busy}
              aria-label="Choose a local file for the demo, up to 2 MiB"
              onChange={(event) => chooseLocal(event.currentTarget.files?.[0])}
            />
          </label>
        </Button>
      </div>
      <div className="lab-stage">
        <section
          className="lab-window lab-sender"
          aria-label="Sending side in this browser"
        >
          <div className="lab-window-bar">
            <span className="lab-window-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>Sender</span>
            <span className="lab-window-caption">Your file</span>
          </div>
          <div className="lab-window-body">
            <div className="lab-file-summary">
              {sample === "image" && posterUrl ? (
                <img
                  className="lab-poster"
                  src={posterUrl}
                  width={104}
                  height={76}
                  alt="Original dot-study SVG sample"
                />
              ) : (
                <LabFileIcon sample={sample} name={file.name} size={48} />
              )}
              <div className="lab-file-details">
                <strong data-testid="lab-filename">{file.name}</strong>
                <span>
                  {sizeLabel(file.size)} <span aria-hidden="true">·</span>{" "}
                  {sample === "custom"
                    ? "Stays in this browser"
                    : "Original sample"}
                </span>
              </div>
            </div>
            <div className="lab-sender-action">
              {phase === "ready" ||
              phase === "declined" ||
              phase === "cancelled" ? (
                <Button ref={offerButton} className="h-11 px-5" onClick={offer}>
                  Offer this file <ArrowRight aria-hidden="true" />
                </Button>
              ) : (
                <span className="lab-offer-state">
                  {phase === "received" ? (
                    <>
                      <Check aria-hidden="true" /> Handoff complete
                    </>
                  ) : phase === "failed" ? (
                    "Keep the file. Try again."
                  ) : (
                    <>
                      <Check aria-hidden="true" /> File offer ready
                    </>
                  )}
                </span>
              )}
              <span className="lab-sender-note">
                {hasOffer
                  ? "No upload or sharing session."
                  : "First, the receiver gets a choice."}
              </span>
            </div>
          </div>
        </section>
        <div className="lab-bridge" aria-hidden="true">
          <span />
          <ArrowRight />
          <span />
        </div>
        <section
          className="lab-window lab-receiver"
          aria-label="Receiving side in this browser"
        >
          <div className="lab-window-bar">
            <span className="lab-window-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>Receiver</span>
            <span className="lab-window-caption">Approval first</span>
          </div>
          <div className="lab-window-body">
            <div className="lab-file-summary">
              {result && sample === "image" && downloadUrl ? (
                <img
                  className="lab-poster"
                  src={downloadUrl}
                  width={104}
                  height={76}
                  alt="Verified received copy of the dot study"
                />
              ) : (
                <LabFileIcon
                  sample={hasOffer ? sample : "waiting"}
                  name={hasOffer ? file.name : ""}
                  size={40}
                  className={!hasOffer ? "lab-waiting-file" : undefined}
                />
              )}
              <div className="lab-file-details">
                <strong>{receiverLabel}</strong>
                <span>
                  {hasOffer ? file.name : "File bytes wait for your approval."}
                </span>
              </div>
            </div>
            {busy || result ? (
              <div className="lab-meter">
                <Progress
                  data-testid="lab-progress"
                  value={percent}
                  aria-label="Sample file bytes received"
                />
                <span>
                  <span aria-hidden="true">
                    {receivedBytes.toLocaleString()} /{" "}
                    {file.size.toLocaleString()} bytes
                  </span>
                  <span>
                    {phase === "verifying" ? (
                      "Checking"
                    ) : result ? (
                      <>
                        <Check aria-hidden="true" /> Hashes match
                      </>
                    ) : (
                      `${Math.floor(percent)}%`
                    )}
                  </span>
                </span>
              </div>
            ) : null}
            <div className="lab-receiver-actions">
              {phase === "offered" ? (
                <>
                  <Button
                    ref={approveButton}
                    className="h-11 px-5"
                    onClick={() => void approve()}
                  >
                    Approve file <Check aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-11 px-4"
                    onClick={decline}
                  >
                    Decline
                  </Button>
                </>
              ) : busy ? (
                <Button
                  variant="outline"
                  ref={cancelButton}
                  className="h-11 px-4"
                  onClick={cancel}
                >
                  Cancel transfer
                </Button>
              ) : result && downloadUrl ? (
                <Button asChild className="h-11 px-4">
                  <a
                    ref={downloadLink}
                    data-testid="lab-download"
                    href={downloadUrl}
                    download={result.filename}
                  >
                    Download received file <DownloadSimple aria-hidden="true" />
                  </a>
                </Button>
              ) : phase === "failed" ? (
                <Button
                  ref={retryButton}
                  className="h-11 px-4"
                  onClick={() => void approve()}
                >
                  Retry transfer <ArrowClockwise aria-hidden="true" />
                </Button>
              ) : (
                <span className="lab-receiver-note">
                  {phase === "declined"
                    ? "No payload was sent."
                    : phase === "cancelled"
                      ? "No unfinished download to keep."
                      : "You can approve or decline the offer."}
                </span>
              )}
            </div>
          </div>
        </section>
      </div>
      <div className="lab-footer">
        <p
          className="lab-status"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {phaseCopy[phase]}
        </p>
        {phase !== "ready" ? (
          <Button
            variant="ghost"
            className="h-11 px-3"
            onClick={() => {
              reset();
              requestFocus("offer");
            }}
            aria-label="Reset local WebRTC demo"
          >
            <ArrowClockwise aria-hidden="true" />
            Reset
          </Button>
        ) : (
          <span className="lab-privacy-note">
            No coordinator. No other device.
          </span>
        )}
      </div>
      {error ? (
        <p className="lab-error" role="alert">
          {error}
        </p>
      ) : null}
      {result ? (
        <div className="lab-receipt" aria-label="Verified transfer receipt">
          <span>SHA-256</span>
          <code data-testid="lab-sender-hash" title={result.senderHash}>
            {result.senderHash}
          </code>
          <code className="bj-sr" data-testid="lab-receiver-hash">
            {result.receiverHash}
          </code>
          {onOpenApp ? (
            <Button variant="link" className="h-11 px-0" onClick={onOpenApp}>
              Share with someone <ArrowRight aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      ) : null}
      <p className="lab-limit">
        A real local WebRTC data-channel transfer, not a test of your Wi-Fi or
        another device.
      </p>
    </div>
  );
}

export default HandoffLab;
