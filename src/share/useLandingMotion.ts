import { useEffect, type RefObject } from "react";
import { useMediaQuery } from "./theme";

/** Reveal each section once, leaving document content visible without animation support. */
export function useLandingMotion(root: RefObject<HTMLDivElement | null>) {
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  useEffect(() => {
    if (reduced || !root.current) return;
    const animations = new Set<Animation>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const animation = entry.target.animate(
            [
              { opacity: 0, transform: "translateY(24px)" },
              { opacity: 1, transform: "translateY(0)" },
            ],
            { duration: 700, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
          );
          animations.add(animation);
          void animation.finished
            .catch(() => {})
            .finally(() => animations.delete(animation));
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.12 },
    );
    root.current
      .querySelectorAll("[data-reveal]")
      .forEach((element) => observer.observe(element));
    return () => {
      observer.disconnect();
      animations.forEach((animation) => animation.cancel());
    };
  }, [root, reduced]);
}
