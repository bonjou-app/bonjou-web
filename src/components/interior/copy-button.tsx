import { useCallback, useEffect, useRef, useState } from "react";
import { Check } from "@phosphor-icons/react/dist/csr/Check";
import { Copy } from "@phosphor-icons/react/dist/csr/Copy";
import { X } from "@phosphor-icons/react/dist/csr/X";

import { Button } from "@/components/ui/button";

export type CopyStatus = "idle" | "copied" | "error";

export interface UseCopyToClipboardOptions {
  timeout?: number;
  onCopy?: (value: string) => void;
  onError?: (reason: unknown) => void;
}

function writeFallback(text: string): boolean {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  document.body.removeChild(area);
  return copied;
}

/** Interior's resilient, announced clipboard behavior. */
export function useCopyToClipboard({
  timeout = 2000,
  onCopy,
  onError,
}: UseCopyToClipboardOptions = {}) {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const [ticket, setTicket] = useState(0);
  const mounted = useRef(true);
  const copied = useRef(onCopy);
  const failed = useRef(onError);
  copied.current = onCopy;
  failed.current = onError;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const copy = useCallback(async (text: string) => {
    if (!text) return false;

    let ok = false;
    let reason: unknown = null;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      } else {
        ok = writeFallback(text);
      }
    } catch (error) {
      reason = error;
      ok = writeFallback(text);
    }

    if (!mounted.current) return ok;
    setStatus(ok ? "copied" : "error");
    setTicket((value) => value + 1);
    if (ok) copied.current?.(text);
    else failed.current?.(reason);
    return ok;
  }, []);

  useEffect(() => {
    if (ticket === 0 || status === "idle") return;
    const timer = setTimeout(() => setStatus("idle"), timeout);
    return () => clearTimeout(timer);
  }, [status, ticket, timeout]);

  return { copy, status, copied: status === "copied" };
}

export interface CopyButtonProps {
  value: string;
  label?: string;
  copiedLabel?: string;
  errorLabel?: string;
  timeout?: number;
  onCopy?: (value: string) => void;
  onError?: (reason: unknown) => void;
  disabled?: boolean;
  className?: string;
}

/** Interior's non-jumping copy interaction, reskinned with Bonjou tokens. */
export function CopyButton({
  value,
  label = "Copy",
  copiedLabel = "Copied",
  errorLabel = "Failed",
  timeout = 2000,
  onCopy,
  onError,
  disabled = false,
  className = "",
}: CopyButtonProps) {
  const { copy, status } = useCopyToClipboard({ timeout, onCopy, onError });
  const labels: Array<[CopyStatus, string]> = [
    ["idle", label],
    ["copied", copiedLabel],
    ["error", errorLabel],
  ];

  return (
    <Button asChild variant="outline" size="sm" className={className}>
      <button
        type="button"
        disabled={disabled}
        aria-label={label}
        onClick={() => void copy(value)}
      >
        {status === "copied" ? (
          <Check className="size-4" aria-hidden="true" />
        ) : status === "error" ? (
          <X className="size-4" aria-hidden="true" />
        ) : (
          <Copy className="size-4" aria-hidden="true" />
        )}

        <span aria-hidden="true" className="relative grid">
          {labels.map(([key, text]) => (
            <span
              key={key}
              style={{ opacity: key === status ? 1 : 0 }}
              className="col-start-1 row-start-1 whitespace-nowrap transition-opacity"
            >
              {text}
            </span>
          ))}
        </span>
        <span role="status" aria-live="polite" className="sr-only">
          {status === "copied"
            ? copiedLabel
            : status === "error"
              ? errorLabel
              : ""}
        </span>
      </button>
    </Button>
  );
}
