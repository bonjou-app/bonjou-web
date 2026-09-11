import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Landing } from "./Landing";
import { useTheme } from "./theme";

const ShareApp = lazy(() => import("./ShareApp"));
function isApp() {
  return (
    /^\/(app|share)(\/|$)/.test(location.pathname) ||
    location.pathname.startsWith("/r/") ||
    Boolean(new URLSearchParams(location.search).get("r"))
  );
}

export default function App() {
  const [visible, setVisible] = useState(isApp);
  const [visited, setVisited] = useState(isApp);
  const appPath = useRef(
    isApp() ? location.pathname + location.search : "/app",
  );
  const theme = useTheme();
  const openApp = useCallback(() => {
    history.pushState(null, "", appPath.current);
    setVisible(true);
    setVisited(true);
    window.scrollTo(0, 0);
  }, []);
  useEffect(() => {
    const pop = () => {
      const next = isApp();
      setVisible(next);
      if (next) setVisited(true);
    };
    const follow = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = (event.target as Element).closest<HTMLAnchorElement>(
        "a[href='/']",
      );
      if (!anchor || !isApp()) return;
      event.preventDefault();
      appPath.current = location.pathname + location.search;
      history.pushState(null, "", "/");
      setVisible(false);
      window.scrollTo(0, 0);
    };
    window.addEventListener("popstate", pop);
    document.addEventListener("click", follow);
    return () => {
      window.removeEventListener("popstate", pop);
      document.removeEventListener("click", follow);
    };
  }, []);
  return (
    <TooltipProvider>
      {!visible ? (
        <Landing
          onOpenApp={openApp}
          theme={theme.resolved}
          onToggleTheme={theme.toggle}
        />
      ) : null}
      {visited ? (
        <Suspense
          fallback={
            <main className="app-loading" role="status">
              Opening your workspace…
            </main>
          }
        >
          <ShareApp visible={visible} theme={theme} />
        </Suspense>
      ) : null}
    </TooltipProvider>
  );
}
