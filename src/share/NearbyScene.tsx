import { useEffect, useRef, useState, type PointerEvent } from "react";
import { ArrowClockwise } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { Check } from "@phosphor-icons/react/dist/csr/Check";
import { Images } from "@phosphor-icons/react/dist/csr/Images";
import { Pause } from "@phosphor-icons/react/dist/csr/Pause";
import { Play } from "@phosphor-icons/react/dist/csr/Play";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useMediaQuery } from "./theme";

type Phase = "ready" | "offered" | "accepted" | "sending" | "received";
type Playback = "idle" | "playing" | "paused" | "done";
const captions: Record<Phase, string> = {
  ready: "A shorter journey for your files.",
  offered: "First, the recipient gets an offer.",
  accepted: "They choose to accept it.",
  sending: "Then it travels straight to their device.",
  received: "And just like that, it’s there.",
};
const status: Record<Phase, string> = {
  ready: "Ready on your laptop",
  offered: "Waiting for approval",
  accepted: "Accepted by your phone",
  sending: "Sending directly",
  received: "Received on your phone",
};

/** An explicitly labelled demonstration, with no connection or payload side effects. */
export function NearbyScene() {
  const frame = useRef<HTMLDivElement>(null);
  const packet = useRef<HTMLDivElement>(null);
  const figure = useRef<HTMLElement>(null);
  const playhead = useRef(0);
  const autoplayed = useRef(false);
  const [phase, setPhase] = useState<Phase>("ready");
  const [playback, setPlayback] = useState<Playback>("idle");
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const finePointer = useMediaQuery("(hover: hover) and (pointer: fine)");

  useEffect(() => {
    const element = figure.current;
    if (!element) return;
    // Run once in view. Scrolling away or changing tabs pauses the demo.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (
          entry.intersectionRatio >= 0.55 &&
          !document.hidden &&
          !reduced &&
          !autoplayed.current
        ) {
          autoplayed.current = true;
          setPlayback("playing");
        } else if (!entry.isIntersecting) {
          setPlayback((current) =>
            current === "playing" ? "paused" : current,
          );
        }
      },
      { threshold: 0.55 },
    );
    const onVisibility = () => {
      if (document.hidden)
        setPlayback((current) => (current === "playing" ? "paused" : current));
    };
    observer.observe(element);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reduced]);

  useEffect(() => {
    if (reduced) {
      frame.current?.style.removeProperty("transform");
      // A preference change also stops an animation already in flight.
      setPlayback((current) =>
        current === "playing" || current === "paused" ? "done" : current,
      );
      setPhase((current) => (current === "ready" ? current : "received"));
      return;
    }
    if (
      (playback !== "playing" && playback !== "paused") ||
      !packet.current ||
      !frame.current
    )
      return;
    const { clientWidth: width, clientHeight: height } = frame.current;
    const at = (x: number, y: number, rotate: number, scale = 1) =>
      `translate(${width * x}px, ${height * y}px) rotate(${rotate}deg) scale(${scale})`;
    const flight = packet.current.animate(
      [
        { transform: at(0.5, 0.38, -12, 0.7), opacity: 0, offset: 0 },
        { transform: at(0.5, 0.38, -12, 0.7), opacity: 0, offset: 0.43 },
        { transform: at(0.56, 0.3, -8), opacity: 1, offset: 0.51 },
        { transform: at(0.72, 0.4, 5), opacity: 1, offset: 0.64 },
        { transform: at(0.72, 0.62, 12), opacity: 1, offset: 0.76 },
        { transform: at(0.6, 0.74, 0, 0.65), opacity: 0, offset: 0.875 },
        { transform: at(0.6, 0.74, 0, 0.65), opacity: 0, offset: 1 },
      ],
      { duration: 4000, easing: "linear" },
    );
    const meter = figure.current?.querySelector(
      '[data-slot="progress-indicator"]',
    );
    const progress = meter?.animate(
      [
        { transform: "translateX(-100%)", offset: 0 },
        { transform: "translateX(-100%)", offset: 0.43 },
        { transform: "translateX(0)", offset: 0.875 },
        { transform: "translateX(0)", offset: 1 },
      ],
      { duration: 4000, easing: "linear" },
    );
    flight.currentTime = playhead.current;
    if (progress) progress.currentTime = playhead.current;
    if (playback === "paused") {
      flight.pause();
      progress?.pause();
    }
    let raf = 0;
    let previous: Phase | undefined;
    const tick = () => {
      const time = Number(flight.currentTime ?? 0);
      const next: Phase =
        time < 1000
          ? "offered"
          : time < 1720
            ? "accepted"
            : time < 3500
              ? "sending"
              : "received";
      if (previous !== next) {
        setPhase(next);
        previous = next;
      }
      if (time >= 4000) setPlayback("done");
      else raf = requestAnimationFrame(tick);
    };
    if (playback === "playing") raf = requestAnimationFrame(tick);
    return () => {
      playhead.current = Number(flight.currentTime ?? 0);
      cancelAnimationFrame(raf);
      flight.cancel();
      progress?.cancel();
    };
  }, [playback, reduced]);

  const control = () => {
    autoplayed.current = true;
    if (reduced) {
      setPhase(phase === "received" ? "ready" : "received");
      setPlayback(phase === "received" ? "idle" : "done");
    } else if (playback === "playing") setPlayback("paused");
    else {
      if (playback !== "paused") playhead.current = 0;
      setPlayback("playing");
    }
  };
  const tilt = (event: PointerEvent<HTMLDivElement>) => {
    if (
      reduced ||
      !finePointer ||
      event.pointerType === "touch" ||
      !frame.current
    )
      return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    frame.current.style.transform = `perspective(1200px) rotateX(${-y * 5}deg) rotateY(${x * 6}deg)`;
  };
  const label = reduced
    ? phase === "received"
      ? "Reset demo"
      : "Show demo result"
    : playback === "playing"
      ? "Pause demo"
      : playback === "paused"
        ? "Resume demo"
        : playback === "done"
          ? "Replay demo"
          : "Play sharing demo";

  return (
    <figure
      className="hero-scene"
      ref={figure}
      data-phase={phase}
      data-playback={playback}
    >
      <div
        className="scene-perspective"
        onPointerMove={tilt}
        onPointerLeave={() => frame.current?.style.removeProperty("transform")}
      >
        <div className="scene-frame" ref={frame}>
          <img
            src="/images/nearby-devices.webp"
            srcSet="/images/nearby-devices-small.webp 800w, /images/nearby-devices.webp 1600w"
            sizes="(max-width: 760px) 100vw, 60vw"
            width="1600"
            height="1400"
            alt="A silver laptop and phone sharing a file on a sunlit desk."
            fetchPriority="high"
          />
          <div className="scene-label">
            <span /> Same Wi-Fi. Just a little closer.
          </div>
          <div className="demo-file" aria-hidden="true">
            <div className="demo-file-icon">
              {phase === "received" ? (
                <Check weight="bold" />
              ) : (
                <Images weight="duotone" />
              )}
            </div>
            <div className="demo-file-copy">
              <strong>Lunch photos.zip</strong>
              <span key={phase}>{status[phase]}</span>
              <Progress
                className="demo-progress h-0.5"
                value={phase === "received" ? 100 : 0}
              />
            </div>
          </div>
          <div className="demo-packet" ref={packet} aria-hidden="true">
            <Images weight="duotone" />
          </div>
          <div className="demo-received" aria-hidden="true">
            <Check weight="bold" /> Got it. Thank you!
          </div>
        </div>
      </div>
      <figcaption className="demo-controls">
        <div>
          <span className="demo-label">Sharing demo</span>
          <p aria-live="off" data-demo-caption>
            {captions[phase]}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-11 shrink-0"
          onClick={control}
          aria-label={label}
        >
          {playback === "playing" ? (
            <Pause weight="fill" />
          ) : playback === "done" ? (
            <ArrowClockwise />
          ) : (
            <Play weight="fill" />
          )}
          <span>
            {reduced
              ? phase === "received"
                ? "Reset"
                : "Try it"
              : playback === "playing"
                ? "Pause"
                : playback === "paused"
                  ? "Resume"
                  : playback === "done"
                    ? "Replay"
                    : "Play"}
          </span>
        </Button>
      </figcaption>
      <p className="bj-sr">
        Illustrative demo: the recipient approves the offer, then the photos
        travel directly from the laptop to the phone.
      </p>
    </figure>
  );
}
