import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkBrowserCapabilities,
  connectionOutcome,
} from "./ConnectionExplorer";

const nativeCrypto = globalThis.crypto;

afterEach(() => vi.unstubAllGlobals());

describe("connection setup requirements", () => {
  // The full product truth table catches false promises for offline browser
  // discovery, isolated guests and separate networks as choices are combined.
  it.each([
    ["browser", "local", true, "local"],
    ["browser", "local", false, "offline"],
    ["browser", "guest", true, "uncertain"],
    ["browser", "guest", false, "offline"],
    ["browser", "separate", true, "blocked"],
    ["browser", "separate", false, "blocked"],
    ["cli", "local", true, "local"],
    ["cli", "local", false, "local"],
    ["cli", "guest", true, "uncertain"],
    ["cli", "guest", false, "uncertain"],
    ["cli", "separate", true, "blocked"],
    ["cli", "separate", false, "blocked"],
  ] as const)(
    "%s on %s, internet %s requires %s",
    (client, network, online, expected) => {
      const result = connectionOutcome(client, network, online);
      expect(result.state).toBe(expected);
      expect(result.steps.length).toBeGreaterThan(0);
      if (network === "separate") {
        expect(result.description).toContain("cannot bridge networks");
        expect(result.steps.join(" ")).toContain("same reachable");
      } else if (client === "browser" && !online) {
        expect(result.description).toContain("online coordinator");
        expect(result.steps.join(" ")).toContain("Restore internet access");
      } else if (network === "guest") {
        expect(result.description).toContain("If device isolation is enabled");
        expect(result.steps.join(" ")).toContain("network owner");
      } else if (client === "cli") {
        expect(result.description).toContain("without an internet connection");
        expect(result.steps.join(" ")).toContain("both devices");
      } else {
        expect(result.description).toContain("same source network");
        expect(result.description).toContain(
          "directly between reachable devices",
        );
      }
    },
  );
});

describe("local browser capability check", () => {
  it("uses actual cryptography without connecting peers, sockets or workers", async () => {
    const peer = vi.fn(() => {
      throw new Error("must not open a peer");
    });
    const socket = vi.fn(() => {
      throw new Error("must not open a socket");
    });
    const serviceWorker = vi.fn(() => {
      throw new Error("must not access a worker");
    });
    const navigator = {};
    Object.defineProperty(navigator, "serviceWorker", { get: serviceWorker });
    vi.stubGlobal("navigator", navigator);
    vi.stubGlobal("window", {
      isSecureContext: true,
      RTCPeerConnection: peer,
      WebSocket: socket,
      crypto: nativeCrypto,
    });
    const results = await checkBrowserCapabilities();
    expect(results).toHaveLength(5);
    expect(results.every((result) => result.available)).toBe(true);
    expect(
      results.find((result) => result.name === "Browser cryptography")?.detail,
    ).toContain("round-trip passed");
    expect(
      results.find((result) => result.name === "Service worker API")?.detail,
    ).toContain("registration and downloads are not tested");
    expect(peer).not.toHaveBeenCalled();
    expect(socket).not.toHaveBeenCalled();
    expect(serviceWorker).not.toHaveBeenCalled();
  });

  it("reports missing APIs as unavailable without throwing", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("window", { isSecureContext: false });
    const results = await checkBrowserCapabilities();
    expect(results).toHaveLength(5);
    expect(results.every((result) => !result.available)).toBe(true);
  });

  it("does not equate an exposed crypto API with working operations", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("window", {
      isSecureContext: true,
      crypto: {
        subtle: {
          digest: async () => {
            throw new Error("operation refused");
          },
        },
      },
    });
    const results = await checkBrowserCapabilities();
    expect(
      results.find((result) => result.name === "Browser cryptography")
        ?.available,
    ).toBe(false);
    expect(
      results.find((result) => result.name === "Browser cryptography")?.detail,
    ).toContain("could not complete");
  });
});
