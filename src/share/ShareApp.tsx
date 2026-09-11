import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { TabTaken } from "./TabTaken";
import { Workspace } from "./Workspace";
import { useSessionOwnership } from "./tabs";
import type { useTheme } from "./theme";
import { sanitizePeerName, useSession } from "./useSession";

function storedName() {
  try {
    const saved = localStorage.getItem("bonjou.name") ?? "";
    return saved.trim() ? sanitizePeerName(saved) : "";
  } catch {
    return "";
  }
}
export default function ShareApp({
  visible,
  theme,
}: {
  visible: boolean;
  theme: ReturnType<typeof useTheme>;
}) {
  const [name, setName] = useState(storedName);
  const ownership = useSessionOwnership();
  const owns = ownership.state === "owner";
  const session = useSession(name, Boolean(name) && owns);
  const commitName = useCallback((value: string) => {
    if (!value.trim()) return;
    const next = sanitizePeerName(value);
    try {
      localStorage.setItem("bonjou.name", next);
    } catch {
      /* Session-only name. */
    }
    setName(next);
  }, []);
  const { notice, setNotice } = session;
  useEffect(() => {
    if (!notice) return;
    toast(notice);
    setNotice("");
  }, [notice, setNotice]);
  return (
    <>
      {owns ? (
        <Workspace
          visible={visible}
          name={name}
          onName={commitName}
          session={session}
          themeChoice={theme.choice}
          theme={theme.resolved}
          onThemeChoice={theme.setChoice}
          onToggleTheme={theme.toggle}
        />
      ) : visible ? (
        ownership.state === "acquiring" ? (
          <main className="app-loading" role="status">
            Opening your workspace…
          </main>
        ) : (
          <TabTaken onTakeOver={ownership.takeOver} />
        )
      ) : null}
      <Toaster
        position="bottom-center"
        theme={theme.resolved}
        toastOptions={{ className: "bj-toast" }}
      />
    </>
  );
}
