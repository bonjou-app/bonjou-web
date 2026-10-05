import { X } from "@phosphor-icons/react/dist/csr/X";

import { Button } from "@/components/ui/button";
import { FileIcon } from "./FileIcon";
import { formatBytes } from "./transfer";
import type { StagedBatch } from "./staging";

function fileType(batch: StagedBatch): string {
  if (batch.folder)
    return `Folder · ${batch.files.length} ${batch.files.length === 1 ? "file" : "files"} · ZIP`;
  const type = batch.files[0].type;
  if (type.startsWith("image/")) return "Image";
  if (type.startsWith("video/")) return "Video";
  if (type.startsWith("audio/")) return "Audio";
  if (type === "application/pdf") return "PDF";
  if (type.startsWith("text/")) return "Text";
  return "File";
}

export function StagingTray({
  batches,
  reading,
  offering,
  destination,
  recipientNames = [],
  canOffer,
  onRemove,
  onClear,
  onOffer,
}: {
  batches: StagedBatch[];
  reading: boolean;
  offering: boolean;
  destination: string;
  recipientNames?: string[];
  canOffer: boolean;
  onRemove: (id: string) => void;
  onClear: () => void;
  onOffer: () => void;
}) {
  const count = batches.reduce((total, batch) => total + batch.files.length, 0);
  const bytes = batches.reduce((total, batch) => total + batch.size, 0);
  const noun = count === 1 ? "file" : "files";
  const audience =
    recipientNames.length > 1
      ? `${recipientNames.length} people: ${recipientNames.join(", ")}`
      : (recipientNames[0] ?? destination);
  return (
    <section className="staging-tray" aria-label="Staged files">
      <div className="staging-head">
        <p role="status" aria-live="polite">
          {reading ? "Reading your selection…" : `${count} ${noun} staged`}
          {count > 0 ? (
            <span className="staging-total">{formatBytes(bytes)}</span>
          ) : null}
        </p>
        <Button
          type="button"
          variant="ghost"
          className="h-11 px-3"
          disabled={offering}
          onClick={onClear}
        >
          Clear files
        </Button>
      </div>
      {batches.length > 0 ? (
        <div
          className="staging-scroll bj-scroll"
          tabIndex={0}
          role="region"
          aria-label="Files staged on this device"
        >
          <ul className="staging-list">
            {batches.map((batch) => (
              <li key={batch.id} className="staging-row">
                <FileIcon name={batch.name} folder={batch.folder} size={22} />
                <div className="staging-item">
                  <span className="staging-name">{batch.name}</span>
                  <span className="staging-detail">
                    {fileType(batch)} · {formatBytes(batch.size)}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  disabled={offering}
                  aria-label={`Remove ${batch.name}`}
                  data-stage-remove={batch.id}
                  onClick={() => onRemove(batch.id)}
                >
                  <X size={16} aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="staging-actions">
        <p className="staging-caption">
          {canOffer ? `To ${audience}` : "Choose a person when they appear."}
          <span>Local until you offer. Downloads wait for approval.</span>
        </p>
        <Button
          type="button"
          className="h-11 px-4"
          disabled={!canOffer || !count || reading || offering}
          onClick={onOffer}
          aria-label={`Offer files to ${canOffer ? audience : "a recipient"} (${count} ${noun})`}
        >
          {offering ? "Offering…" : "Offer files"}
          {!offering && count > 0 ? (
            <span aria-hidden="true">· {count}</span>
          ) : null}
        </Button>
      </div>
    </section>
  );
}
