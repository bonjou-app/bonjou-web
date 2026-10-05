import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { Browser } from "@phosphor-icons/react/dist/csr/Browser";
import { CheckCircle } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { Globe } from "@phosphor-icons/react/dist/csr/Globe";
import { Laptop } from "@phosphor-icons/react/dist/csr/Laptop";
import { LockKey } from "@phosphor-icons/react/dist/csr/LockKey";
import { TerminalWindow } from "@phosphor-icons/react/dist/csr/TerminalWindow";
import { WarningCircle } from "@phosphor-icons/react/dist/csr/WarningCircle";
import { WifiHigh } from "@phosphor-icons/react/dist/csr/WifiHigh";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type Client = "browser" | "cli";
type Network = "local" | "guest" | "separate";
type RouteState = "local" | "uncertain" | "blocked" | "offline";

const networks: { value: Network; label: string }[] = [
  { value: "local", label: "Same Wi-Fi / Ethernet" },
  { value: "guest", label: "Guest Wi-Fi" },
  { value: "separate", label: "Different networks" },
];

/** These describe the selected setup; they are not connectivity measurements. */
export function connectionOutcome(
  client: Client,
  network: Network,
  online: boolean,
) {
  if (network === "separate") {
    return {
      state: "blocked" as RouteState,
      label: "A local route is needed",
      title: "Bring both devices onto one LAN.",
      description:
        "Internet access alone does not join separate networks. A browser room code narrows a group; it cannot bridge networks or bypass isolation.",
      steps: [
        "Connect both devices to the same reachable Wi-Fi or Ethernet network.",
        client === "browser"
          ? "Use browsers on both devices, with internet access for discovery."
          : "Run bonjou-cli on both devices; browser and CLI users are separate.",
      ],
    };
  }

  if (client === "browser" && !online) {
    return {
      state: "offline" as RouteState,
      label: "Browser discovery needs internet",
      title: "Go online to find each other.",
      description:
        "A new browser session uses the online coordinator to exchange encrypted connection signals. Files still take the direct, local route.",
      steps: [
        network === "guest"
          ? "Use a network that lets devices reach each other; guest Wi-Fi may isolate them."
          : "Keep both devices on the same reachable local network.",
        "Restore internet access on both devices, then open Bonjou in both browsers.",
      ],
    };
  }

  if (network === "guest") {
    return {
      state: "uncertain" as RouteState,
      label: "Depends on the guest network",
      title: "Some Wi-Fi keeps guests apart.",
      description:
        "If device isolation is enabled, nearby devices cannot connect. Being on the same Wi-Fi name, or using a browser room code, does not remove that restriction.",
      steps: [
        "Ask the network owner whether local device connections are allowed.",
        client === "browser"
          ? "Use browsers on both devices and keep internet access for discovery."
          : "Use bonjou-cli on both devices; internet is optional once installed.",
      ],
    };
  }

  return {
    state: "local" as RouteState,
    label: "A reachable LAN can connect them",
    title:
      client === "browser"
        ? "Meet online. Share locally."
        : online
          ? "The CLI stays on your LAN."
          : "Offline? The CLI can still share.",
    description:
      client === "browser"
        ? "The coordinator introduces browsers on the same source network. Messages, names and files travel directly between reachable devices, encrypted in transit."
        : "Installed CLI clients discover each other on the local network. They can exchange messages and files without an internet connection.",
    steps:
      client === "browser"
        ? [
            "Open Bonjou in both browsers and choose a name.",
            "Pick a nearby person. They approve incoming files before download.",
          ]
        : [
            "Install and run bonjou-cli on both devices.",
            "Allow local discovery through the firewall, then choose a nearby peer.",
          ],
  };
}

type Capability = {
  name: string;
  available: boolean;
  detail: string;
};

/** All operations stay in this browser. No socket, peer or worker is started. */
export async function checkBrowserCapabilities(): Promise<Capability[]> {
  const results: Capability[] = [
    {
      name: "Secure page",
      available: window.isSecureContext,
      detail: window.isSecureContext
        ? "HTTPS or a trusted local origin"
        : "Open the HTTPS site to use protected browser APIs",
    },
    {
      name: "WebRTC API",
      available: typeof window.RTCPeerConnection === "function",
      detail: "API presence only; no peer connection opened",
    },
    {
      name: "WebSocket API",
      available: typeof window.WebSocket === "function",
      detail: "API presence only; coordinator access is not tested",
    },
  ];

  let cryptoWorks = false;
  try {
    const subtle = window.crypto?.subtle;
    if (subtle) {
      const sample = new TextEncoder().encode(
        "Bonjou browser capability check",
      );
      const digest = await subtle.digest("SHA-256", sample);
      const key = await subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      );
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const sealed = await subtle.encrypt({ name: "AES-GCM", iv }, key, sample);
      const opened = new Uint8Array(
        await subtle.decrypt({ name: "AES-GCM", iv }, key, sealed),
      );
      cryptoWorks =
        digest.byteLength === 32 &&
        opened.length === sample.length &&
        opened.every((byte, index) => byte === sample[index]);
    }
  } catch {
    // A browser may expose an API while refusing the actual operation.
  }
  results.push(
    {
      name: "Browser cryptography",
      available: cryptoWorks,
      detail: cryptoWorks
        ? "Local SHA-256 and AES-GCM round-trip passed"
        : "Local cryptography operations could not complete",
    },
    {
      name: "Service worker API",
      available: "serviceWorker" in navigator,
      detail:
        "Service worker API presence only; registration and downloads are not tested",
    },
  );
  return results;
}

function RouteDiagram({
  client,
  network,
  online,
  state,
}: {
  client: Client;
  network: Network;
  online: boolean;
  state: RouteState;
}) {
  const signals = client === "browser" && online;
  const direct = state === "local";
  return (
    <figure className="explorer-figure">
      <div
        className="explorer-map"
        data-route={state}
        data-client={client}
        aria-hidden="true"
      >
        <div className="explorer-map-heading">
          <span className="explorer-map-dot" />
          {client === "browser" ? "Browser to browser" : "CLI to CLI"}
        </div>
        <svg className="explorer-routes" viewBox="0 0 640 430" fill="none">
          {network === "separate" ? (
            <>
              <rect
                className="explorer-network"
                x="32"
                y="164"
                width="272"
                height="222"
                rx="35"
              />
              <rect
                className="explorer-network"
                x="336"
                y="164"
                width="272"
                height="222"
                rx="35"
              />
            </>
          ) : (
            <rect
              className="explorer-network"
              x="32"
              y="164"
              width="576"
              height="222"
              rx="35"
            />
          )}
          <g
            className={signals ? "explorer-signals is-on" : "explorer-signals"}
          >
            <path d="M 166 207 C 166 127 227 111 264 94" />
            <path d="M 376 94 C 413 111 474 127 474 207" />
          </g>
          <path
            className={direct ? "explorer-direct is-on" : "explorer-direct"}
            d="M 216 258 H 424"
          />
          {direct ? (
            <>
              <path className="explorer-arrow" d="m 412 249 12 9-12 9" />
              <circle
                className="explorer-route-point"
                cx="270"
                cy="258"
                r="5"
              />
              <circle
                className="explorer-route-point"
                cx="370"
                cy="258"
                r="5"
              />
            </>
          ) : (
            <g className="explorer-route-stop">
              <circle cx="320" cy="258" r="15" />
              <path d="m 314 252 12 12 m 0-12-12 12" />
            </g>
          )}
        </svg>
        <div className={`explorer-coordinator ${signals ? "is-on" : ""}`}>
          <Globe size={20} />
          <div>
            <strong>Online coordinator</strong>
            <span>
              {client === "cli"
                ? "Not used by the CLI"
                : online
                  ? "Encrypted connection signals only"
                  : "Needed to start browser discovery"}
            </span>
          </div>
        </div>
        {["Your device", "Their device"].map((label, index) => (
          <div
            className={`explorer-endpoint ${index === 0 ? "is-sender" : "is-recipient"}`}
            key={label}
          >
            <div className="explorer-device">
              {client === "browser" ? (
                <Browser size={23} />
              ) : (
                <TerminalWindow size={23} />
              )}
              <span />
              <span />
              <span />
            </div>
            <strong>{label}</strong>
            <span>
              {client === "browser" ? "Bonjou in a browser" : "bonjou-cli"}
            </span>
          </div>
        ))}
        <div className="explorer-local-label">
          {direct ? <LockKey size={17} /> : <WarningCircle size={17} />}
          <span>
            {direct
              ? "Direct encrypted transfer"
              : network === "separate"
                ? "No shared local route"
                : state === "offline"
                  ? "Discovery unavailable"
                  : "Blocked if guests are isolated"}
          </span>
        </div>
        <div className="explorer-network-label">
          <WifiHigh size={23} />
          <span>
            {network === "local"
              ? "One reachable local network"
              : network === "guest"
                ? "Guest network rules apply"
                : "Two separate local networks"}
          </span>
        </div>
      </div>
      <figcaption className="explorer-map-caption">
        <span>
          <i className="explorer-key is-dashed" />{" "}
          {client === "browser" ? "Online discovery" : "No online coordinator"}
        </span>
        <span>
          <i className="explorer-key" /> Local device connection
        </span>
      </figcaption>
    </figure>
  );
}

export function ConnectionExplorer({
  onOpenApp,
  onInstall,
}: {
  onOpenApp: () => void;
  onInstall?: () => void;
}) {
  const id = useId();
  const [client, setClient] = useState<Client>("browser");
  const [network, setNetwork] = useState<Network>("local");
  const [online, setOnline] = useState(true);
  const [capabilities, setCapabilities] = useState<Capability[] | null>(null);
  const [checking, setChecking] = useState(false);
  const checkRun = useRef(0);
  const outcome = connectionOutcome(client, network, online);

  useEffect(
    () => () => {
      checkRun.current += 1;
    },
    [],
  );

  async function checkBrowser() {
    const run = ++checkRun.current;
    setChecking(true);
    const results = await checkBrowserCapabilities();
    if (run !== checkRun.current) return;
    setCapabilities(results);
    setChecking(false);
  }

  const installAction = onInstall ? (
    <Button variant="outline" className="h-11 px-4" onClick={onInstall}>
      Install the CLI <ArrowRight />
    </Button>
  ) : (
    <Button variant="outline" className="h-11 px-4" asChild>
      <a href="#install">
        Install the CLI <ArrowRight />
      </a>
    </Button>
  );

  return (
    <section
      className="explorer-section"
      id="connection"
      aria-labelledby={`${id}-title`}
      data-client={client}
      data-network={network}
      data-online={online}
    >
      <div className="explorer-intro">
        <div>
          <p className="eyebrow">Find your local route</p>
          <h2 id={`${id}-title`}>
            Will it work
            <br />
            where you are?
          </h2>
        </div>
        <p>
          Your devices need a local route to each other. Choose a client and a
          setup to see what else they need. These choices explain a setup; they
          do not check your network.
        </p>
      </div>
      <div className="explorer-layout">
        <RouteDiagram
          client={client}
          network={network}
          online={online}
          state={outcome.state}
        />
        <div className="explorer-rail">
          <Tabs
            value={client}
            onValueChange={(value) => setClient(value as Client)}
          >
            <TabsList
              className="w-full group-data-horizontal/tabs:h-auto"
              aria-label="Choose Bonjou client"
            >
              <TabsTrigger className="h-11" value="browser">
                <Browser /> Browser
              </TabsTrigger>
              <TabsTrigger className="h-11" value="cli">
                <TerminalWindow /> CLI
              </TabsTrigger>
            </TabsList>
            <TabsContent value="browser" className="explorer-client-note">
              No installation. Open Bonjou on both devices.
            </TabsContent>
            <TabsContent value="cli" className="explorer-client-note">
              Install once. Use bonjou-cli on both devices.
            </TabsContent>
          </Tabs>
          <div className="explorer-network-control">
            <p id={`${id}-network`} className="explorer-control-label">
              Where are the devices?
            </p>
            <ToggleGroup
              type="single"
              value={network}
              onValueChange={(value) => {
                if (value) setNetwork(value as Network);
              }}
              aria-labelledby={`${id}-network`}
              variant="outline"
              className="w-full flex-wrap"
              spacing={1}
            >
              {networks.map(({ value, label }) => (
                <ToggleGroupItem
                  className="h-auto min-h-11 min-w-0 flex-1 whitespace-normal px-2 py-2 text-xs"
                  value={value}
                  key={value}
                >
                  {label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="explorer-online-control">
            <label htmlFor={`${id}-online`}>
              <Globe size={18} />
              Internet {online ? "available" : "offline"}
            </label>
            <Switch
              id={`${id}-online`}
              checked={online}
              onCheckedChange={setOnline}
              aria-label="Internet available in this setup"
              className="after:-inset-y-3.5"
            />
          </div>
          <div
            className="explorer-outcome"
            data-state={outcome.state}
            aria-live="polite"
            aria-atomic="true"
          >
            <p className="explorer-outcome-status">
              {outcome.state === "local" ? (
                <CheckCircle size={18} />
              ) : (
                <WarningCircle size={18} />
              )}
              {outcome.label}
            </p>
            <h3>{outcome.title}</h3>
            <p>{outcome.description}</p>
            <ol role="list">
              {outcome.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
          <div className="explorer-action-row">
            {client === "browser" ? (
              <Button className="h-11 px-4" onClick={onOpenApp}>
                Open Bonjou <ArrowRight />
              </Button>
            ) : (
              installAction
            )}
            <span>
              Browser and CLI clients
              <br />
              do not connect to each other.
            </span>
          </div>
        </div>
      </div>
      <div className="explorer-footnote">
        <p>This is a setup explainer, not a test of your Wi-Fi.</p>
        <Button
          variant="ghost"
          className="h-11 px-3"
          onClick={checkBrowser}
          disabled={checking}
        >
          <Laptop />{" "}
          {checking
            ? "Checking browser support…"
            : capabilities
              ? "Check browser support again"
              : "Check browser support"}
        </Button>
      </div>
      <div className="explorer-capability-announcement bj-sr" role="status">
        {capabilities
          ? `Browser check complete. ${capabilities.filter((item) => item.available).length} of ${capabilities.length} checks available or passed. Network reachability was not tested.`
          : ""}
      </div>
      {capabilities ? (
        <div
          className="explorer-capabilities"
          aria-labelledby={`${id}-check-title`}
        >
          <div className="explorer-check-intro">
            <h3 id={`${id}-check-title`}>What this browser provides</h3>
            <p>
              Checked locally. This does not verify another device, the
              coordinator, or a working download.
            </p>
          </div>
          <dl>
            {capabilities.map((item) => (
              <div key={item.name}>
                <dt>
                  {item.available ? (
                    <CheckCircle size={17} />
                  ) : (
                    <WarningCircle size={17} />
                  )}
                  {item.name}
                </dt>
                <dd>
                  <strong>
                    {item.available ? "Available" : "Unavailable"}
                  </strong>
                  <span>{item.detail}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </section>
  );
}
