import { useEffect, useRef, useState, type MouseEvent } from "react";
import { ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { ArrowUpRight } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
import { Moon } from "@phosphor-icons/react/dist/csr/Moon";
import { Sun } from "@phosphor-icons/react/dist/csr/Sun";
import { List } from "@phosphor-icons/react/dist/csr/List";
import { GithubLogo } from "@phosphor-icons/react/dist/csr/GithubLogo";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Logo } from "./Logo";
import { Install } from "./Install";
import { HandoffLab, type DemoSampleId } from "./HandoffLab";
import { SharingStories } from "./SharingStories";
import { ConnectionExplorer } from "./ConnectionExplorer";
import { BrandArtwork } from "./BrandArtwork";
import { useLandingMotion } from "./useLandingMotion";
import { useMediaQuery, type ResolvedTheme } from "./theme";

const REPO = "https://github.com/kodolabs-hq/bonjou-cli";
const links = [
  ["#try", "Try a handoff"],
  ["#stories", "Made for your day"],
  ["#connection", "Your setup"],
  ["#install", "For the terminal"],
  ["#faq", "Questions"],
];
export function Landing({
  onOpenApp,
  theme,
  onToggleTheme,
}: {
  onOpenApp: () => void;
  theme: ResolvedTheme;
  onToggleTheme: () => void;
}) {
  const site = useRef<HTMLDivElement>(null);
  useLandingMotion(site);
  const [menu, setMenu] = useState(false);
  const [faq, setFaq] = useState("");
  const [labBusy, setLabBusy] = useState(false);
  const [sampleRequest, setSampleRequest] = useState<{
    id: DemoSampleId;
    revision: number;
  }>();
  const trySample = (id: DemoSampleId) => {
    if (labBusy) return;
    setSampleRequest((current) => ({
      id,
      revision: (current?.revision ?? 0) + 1,
    }));
    document.getElementById("handoff")?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "start",
    });
  };
  const followApp = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    onOpenApp();
  };
  const narrow = useMediaQuery("(max-width: 760px)");
  useEffect(() => {
    if (!narrow) setMenu(false);
  }, [narrow]);
  return (
    <div className="site" ref={site}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="masthead">
        <a className="wordmark" href="/" aria-label="Bonjou home">
          <Logo size={25} />
          <span>bonjou</span>
        </a>
        <nav aria-label="Main navigation">
          {links.map(([href, label]) => (
            <a key={href} href={href}>
              {label}
            </a>
          ))}
        </nav>
        <div className="masthead-actions">
          <Button
            variant="ghost"
            size="icon"
            className="size-11"
            onClick={onToggleTheme}
            aria-label={theme === "dark" ? "Switch to light" : "Switch to dark"}
          >
            {theme === "dark" ? <Sun /> : <Moon />}
          </Button>
          <Button
            asChild
            className="hidden min-[761px]:inline-flex h-11 px-4"
          >
            <a href="/app" onClick={followApp}>
              Open Bonjou <ArrowUpRight />
            </a>
          </Button>
          {narrow ? (
            <Sheet open={menu} onOpenChange={setMenu}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  aria-label="Open navigation"
                >
                  <List />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="p-6">
                <SheetHeader className="px-0">
                  <SheetTitle>Explore Bonjou</SheetTitle>
                  <SheetDescription>
                    Sharing, a little closer to home.
                  </SheetDescription>
                </SheetHeader>
                <nav className="mobile-site-links">
                  {links.map(([href, label]) => (
                    <a key={href} href={href} onClick={() => setMenu(false)}>
                      {label}
                      <ArrowUpRight />
                    </a>
                  ))}
                  <a href={REPO} target="_blank" rel="noreferrer">
                    Source on GitHub
                    <ArrowUpRight />
                  </a>
                </nav>
              </SheetContent>
            </Sheet>
          ) : null}
        </div>
      </header>
      <main id="main-content">
        <section
          className="hero hands-on-hero"
          id="try"
          aria-labelledby="hero-title"
        >
          <div className="hero-intro">
            <div>
              <p className="hero-kicker">
                <span aria-hidden="true" />
                Nearby sharing. A little more human.
              </p>
              <h1 id="hero-title">
                <span className="hero-line">
                  <span>Pass it </span>
                </span>
                <span className="hero-line">
                  <span>
                    along<span className="hero-period">.</span>
                  </span>
                </span>
              </h1>
            </div>
            <div className="hero-intro-copy">
              <p>
                Send files, folders, and messages directly
                <br />
                to another device on your Wi-Fi.
              </p>
              <div className="hero-actions">
                <Button asChild className="h-12 px-6 text-base">
                  <a href="/app" onClick={followApp}>
                    Start sharing
                    <ArrowRight />
                  </a>
                </Button>
                <span>No account. No installation.</span>
              </div>
              <a className="hero-lab-link" href="#handoff">
                <span>Or take the controls below</span>
                <ArrowRight />
              </a>
            </div>
          </div>
          <div id="handoff">
            <HandoffLab
              requestedSample={sampleRequest}
              onOpenApp={onOpenApp}
              onBusyChange={setLabBusy}
            />
          </div>
          <div className="hero-proof" aria-label="Sharing principles">
            <span>Choose a person</span>
            <span>They approve</span>
            <span>Files travel directly</span>
            <a href={REPO} target="_blank" rel="noreferrer">
              Open source
              <ArrowUpRight />
            </a>
          </div>
        </section>
        <SharingStories
          onTrySample={trySample}
          onOpenApp={onOpenApp}
          demoBusy={labBusy}
        />
        <section className="consent-interlude" aria-labelledby="consent-title">
          <div className="consent-intro" data-reveal>
            <p>Before the file, a choice.</p>
            <h2 id="consent-title">
              Your file.
              <br />
              Their call.
            </h2>
            <BrandArtwork
              kind="notes"
              className="consent-art"
              sizes="(max-width: 760px) 104px, 176px"
            />
          </div>
          <div className="consent-copy" data-reveal>
            <p>
              Prepare a few files. Pick the right person. Offer them when you’re
              ready. Nothing starts arriving until they accept.
            </p>
            <div className="consent-flow" aria-label="File approval sequence">
              <span>Prepare</span>
              <ArrowRight aria-hidden="true" />
              <span>Offer</span>
              <ArrowRight aria-hidden="true" />
              <strong>Approve</strong>
            </div>
            <Button
              asChild
              variant="secondary"
              className="h-12 px-6"
            >
              <a href="/app" onClick={followApp}>
                Prepare files in Bonjou
                <ArrowUpRight />
              </a>
            </Button>
          </div>
        </section>
        <ConnectionExplorer onOpenApp={onOpenApp} />
        <section className="install-section" id="install">
          <div className="section-heading" data-reveal>
            <div>
              <p className="eyebrow">For the terminal</p>
              <h2>Same idea. One command.</h2>
            </div>
            <p>
              bonjou-cli is a separate way to share with other CLI users. It
              discovers devices on your LAN and works without internet.
            </p>
          </div>
          <Install />
        </section>
        <section className="faq-section" data-reveal id="faq">
          <div>
            <p className="eyebrow">Good to know</p>
            <h2>
              The useful
              <br />
              little details.
            </h2>
          </div>
          <Accordion
            type="single"
            collapsible
            value={faq}
            onValueChange={setFaq}
            className="faq-list"
          >
            <AccordionItem value="network">
              <AccordionTrigger>
                Do we need to be on the same Wi-Fi?
              </AccordionTrigger>
              <AccordionContent forceMount hidden={faq !== "network"}>
                Yes, or the same reachable local network, such as Ethernet
                connected to your Wi-Fi router. Room codes create a smaller
                group on that network. They don&rsquo;t send files over the
                internet.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="internet">
              <AccordionTrigger>
                Does the web app need internet?
              </AccordionTrigger>
              <AccordionContent forceMount hidden={faq !== "internet"}>
                Yes. Browsers use an online coordinator to discover nearby
                candidates and exchange encrypted connection information.
                Messages and files still travel directly. For fully offline
                sharing between computers, use bonjou-cli on both.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="files">
              <AccordionTrigger>Where do received files go?</AccordionTrigger>
              <AccordionContent forceMount hidden={faq !== "files"}>
                Check your browser&rsquo;s downloads after you accept. Folders
                arrive as ZIP archives. Bonjou keeps the transfer list and
                messages for this session only. Files you save are separate from
                that list.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="connection">
              <AccordionTrigger>
                Why can&rsquo;t I see the other person?
              </AccordionTrigger>
              <AccordionContent forceMount hidden={faq !== "connection"}>
                Check that both devices are on the same network, allow local
                network access if your browser asks, and temporarily disconnect
                a VPN. Some guest and office networks block direct connections.
                A room code won&rsquo;t bypass that restriction.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="identity">
              <AccordionTrigger>
                How do I know who I&rsquo;m sharing with?
              </AccordionTrigger>
              <AccordionContent forceMount hidden={faq !== "identity"}>
                Names help you find each other, but anyone can choose a name.
                Open a person&rsquo;s conversation and compare the security
                codes with them in person before sending anything sensitive.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>
        <section className="closing" data-reveal>
          <div>
            <p>Less distance. More doing.</p>
            <h2>
              Your next handoff
              <br />
              starts right here.
            </h2>
          </div>
          <Button asChild className="h-12 px-6 text-base">
            <a href="/app" onClick={followApp}>
              Open Bonjou <ArrowRight />
            </a>
          </Button>
        </section>
      </main>
      <footer className="site-footer">
        <a className="wordmark" href="/" aria-label="Bonjou home">
          <Logo size={23} />
          <span>bonjou</span>
        </a>
        <p>A little less distance between devices.</p>
        <a href={REPO} target="_blank" rel="noreferrer">
          <GithubLogo size={20} /> Source on GitHub
        </a>
        <a href={`${REPO}/issues`} target="_blank" rel="noreferrer">
          Report an issue <ArrowUpRight size={16} />
        </a>
      </footer>
    </div>
  );
}
