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
import { applyMetadata, isApplicationUrl } from "./seo";
import { useTheme } from "./theme";

const ShareApp = lazy(() => import("./ShareApp"));
function isApp() {
  return isApplicationUrl(location.pathname, location.search);
}

export default function App() {
  const [visible, setVisible] = useState(isApp);
  const [visited, setVisited] = useState(isApp);
  const [routeRevision, setRouteRevision] = useState(0);
  const appPath = useRef(
    isApp() ? location.pathname + location.search : "/app",
  );
  const theme = useTheme();
  useEffect(() => {
    applyMetadata(visible);
  }, [visible]);
  const rememberAppPath = useCallback((path: string) => {
    appPath.current = path;
  }, []);
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
      setRouteRevision((value) => value + 1);
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
          <ShareApp
            visible={visible}
            routeRevision={routeRevision}
            theme={theme}
            onAppPath={rememberAppPath}
          />
        </Suspense>
      ) : null}
    </TooltipProvider>
  );
}
