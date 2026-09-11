import { useRef, useState } from "react";
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
import { NearbyScene } from "./NearbyScene";
import { useLandingMotion } from "./useLandingMotion";
import { useMediaQuery, type ResolvedTheme } from "./theme";

const REPO = "https://github.com/bonjou-app/bonjou-cli";
const WEB_REPO = "https://github.com/bonjou-app/bonjou-web";
const links = [
  ["#how", "How it works"],
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
  const narrow = useMediaQuery("(max-width: 760px)");
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
            className="hidden min-[761px]:inline-flex h-11 px-4"
            onClick={onOpenApp}
          >
            Open Bonjou <ArrowUpRight />
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
                  <a href={WEB_REPO} target="_blank" rel="noreferrer">
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
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow">
              <span aria-hidden="true" /> Made for the same Wi-Fi
            </p>
            <h1 id="hero-title">
              <span className="hero-line">
                <span>Right here.</span>
              </span>
              <span className="hero-line">
                <span>
                  Right to you<span className="hero-period">.</span>
                </span>
              </span>
            </h1>
            <p className="hero-description">
              The photo from lunch. The folder for tomorrow.
              <br className="desktop-break" /> Send it straight to someone
              nearby.
            </p>
            <div className="hero-actions">
              <Button onClick={onOpenApp} className="h-12 px-6 text-base">
                Start sharing <ArrowRight />
              </Button>
              <span>No account. No installation.</span>
            </div>
            <a className="hero-cli" href="#install">
              More at home in a terminal?{" "}
              <span>
                Meet bonjou-cli <ArrowUpRight />
              </span>
            </a>
          </div>
          <NearbyScene />
        </section>
        <div className="principles" aria-label="How Bonjou shares">
          <span>Device to device</span>
          <span>Encrypted in transit</span>
          <span>You choose what to receive</span>
          <a href={WEB_REPO} target="_blank" rel="noreferrer">
            Open source <ArrowUpRight />
          </a>
        </div>
        <section className="how-section" id="how">
          <div className="section-intro" data-reveal>
            <p className="eyebrow">A familiar kind of sharing</p>
            <h2>
              Same room.
              <br />
              Fewer steps.
            </h2>
            <p>
              No link to upload. No inbox to search. Just you, the person beside
              you, and a direct connection.
            </p>
          </div>
          <ol className="sharing-steps" data-reveal>
            <li>
              <span>01</span>
              <div>
                <h3>Say hello.</h3>
                <p>
                  Open Bonjou on both devices and choose a name. People you can
                  reach on your network appear automatically.
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h3>Pick a person. Send something.</h3>
                <p>
                  A quick message, a file, or a whole folder. Use a room code
                  when you want a smaller group.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h3>They accept. It arrives.</h3>
                <p>
                  Files travel directly between your devices. Every download
                  starts with the recipient&rsquo;s approval.
                </p>
              </div>
            </li>
          </ol>
        </section>
        <section className="privacy-section" data-reveal>
          <p className="eyebrow">Close by, kept private</p>
          <h2>
            Your files take
            <br />
            the local route.
          </h2>
          <div className="privacy-copy">
            <p>
              A small online service helps browsers find each other. Your
              messages and files then travel over an encrypted connection
              between your devices.
            </p>
            <p>
              Bonjou&rsquo;s server never receives your file contents. Networks
              that isolate devices, including some guest Wi-Fi networks, can
              prevent a connection.
            </p>
            <a
              href={`${REPO}/blob/main/docs/security-model.md`}
              target="_blank"
              rel="noreferrer"
            >
              Read the security model <ArrowUpRight />
            </a>
          </div>
        </section>
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
            <h2>A few questions.</h2>
          </div>
          <Accordion type="single" collapsible className="faq-list">
            <AccordionItem value="network">
              <AccordionTrigger>
                Do we need to be on the same Wi-Fi?
              </AccordionTrigger>
              <AccordionContent>
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
              <AccordionContent>
                Yes. Browsers use an online coordinator to discover nearby
                candidates and exchange encrypted connection information.
                Messages and files still travel directly. For fully offline
                sharing between computers, use bonjou-cli on both.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="files">
              <AccordionTrigger>Where do received files go?</AccordionTrigger>
              <AccordionContent>
                Into your browser&rsquo;s downloads after you accept. Folders
                arrive as ZIP archives. Bonjou keeps the transfer list and
                messages for this session only; your downloaded files stay on
                your device.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="connection">
              <AccordionTrigger>
                Why can&rsquo;t I see the other person?
              </AccordionTrigger>
              <AccordionContent>
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
              <AccordionContent>
                Names help you find each other, but anyone can choose a name.
                Open a person&rsquo;s conversation and compare the security
                codes with them in person before sending anything sensitive.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>
        <section className="closing" data-reveal>
          <h2>Have something to pass along?</h2>
          <Button onClick={onOpenApp} className="h-12 px-6 text-base">
            Open Bonjou <ArrowRight />
          </Button>
        </section>
      </main>
      <footer className="site-footer">
        <a className="wordmark" href="/" aria-label="Bonjou home">
          <Logo size={23} />
          <span>bonjou</span>
        </a>
        <p>A little less distance between devices.</p>
        <a href={WEB_REPO} target="_blank" rel="noreferrer">
          <GithubLogo size={20} /> Source on GitHub
        </a>
        <a href={`${WEB_REPO}/issues`} target="_blank" rel="noreferrer">
          Report an issue <ArrowUpRight size={16} />
        </a>
      </footer>
    </div>
  );
}
