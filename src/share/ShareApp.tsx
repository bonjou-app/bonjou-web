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
  routeRevision,
  theme,
  onAppPath,
}: {
  visible: boolean;
  routeRevision: number;
  theme: ReturnType<typeof useTheme>;
  onAppPath: (path: string) => void;
}) {
  const [name, setName] = useState(storedName);
  const ownership = useSessionOwnership();
  const owns = ownership.state === "owner";
  const session = useSession(name, Boolean(name) && owns);
  useEffect(() => {
    const appRoute =
      /^\/(app|share)(\/|$)/.test(location.pathname) ||
      location.pathname.startsWith("/r/") ||
      Boolean(new URLSearchParams(location.search).get("r"));
    if (
      visible &&
      owns &&
      appRoute &&
      session.status === "connected" &&
      !session.roomPending
    ) {
      // Browser history can revisit an old room after this preserved session
      // has left it. Keep the visible route honest about the current scope.
      const path = session.code ? `/r/${session.code}` : "/app";
      if (location.pathname + location.search !== path)
        history.replaceState(null, "", path);
      onAppPath(path);
      return;
    }
    // Room confirmations replace the URL without a popstate event. Remember
    // that destination before browser Back hides this preserved session.
    if (session.code) onAppPath(`/r/${session.code}`);
    else if (session.roomError) onAppPath("/app");
    else if (visible && (location.pathname !== "/" || location.search))
      onAppPath(location.pathname + location.search);
  }, [
    visible,
    routeRevision,
    owns,
    session.status,
    session.code,
    session.roomPending,
    session.roomError,
    onAppPath,
  ]);
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
