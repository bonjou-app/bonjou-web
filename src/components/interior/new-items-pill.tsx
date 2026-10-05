import { useEffect, useState } from "react";
import { ArrowDown } from "@phosphor-icons/react/dist/csr/ArrowDown";

import { Button } from "@/components/ui/button";

export interface NewItemsPillProps {
  count: number;
  visible?: boolean;
  onJump: () => void;
  className?: string;
}

/** Interior's announced, interruptible new-items feedback for a message thread. */
export function NewItemsPill({
  count,
  visible = count > 0,
  onJump,
  className = "",
}: NewItemsPillProps) {
  const [announced, setAnnounced] = useState(0);

  useEffect(() => {
    if (count === 0) {
      setAnnounced(0);
      return;
    }
    const timer = setTimeout(() => setAnnounced(count), 700);
    return () => clearTimeout(timer);
  }, [count]);

  const label =
    count > 0
      ? `${count} new ${count === 1 ? "item" : "items"}`
      : "Jump to the newest";

  return (
    <>
      {visible ? (
        <Button asChild variant="outline" size="sm" className={className}>
          <button type="button" onClick={onJump} aria-label={label}>
            <ArrowDown
              size={18}
              className="size-[1.125rem]"
              aria-hidden="true"
            />
            {count > 0 ? <span>{count}</span> : null}
          </button>
        </Button>
      ) : null}

      <span role="status" aria-live="polite" className="sr-only">
        {announced > 0
          ? `${announced} new ${announced === 1 ? "item" : "items"}`
          : ""}
      </span>
    </>
  );
}
