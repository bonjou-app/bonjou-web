import { describe, expect, it } from "vitest";

import {
  DEFAULT_COORDINATOR_BASE,
  resolveCoordinatorBase,
} from "./coordinatorConfig";

describe("public coordinator configuration", () => {
  it.each([undefined, "", " \n\t "])(
    "uses the same public default for missing or empty configuration (%j)",
    (value) => {
      expect(resolveCoordinatorBase(value)).toBe(DEFAULT_COORDINATOR_BASE);
    },
  );

  it("normalizes surrounding whitespace, the hostname, and trailing slashes", () => {
    expect(resolveCoordinatorBase(" HTTPS://SIGNAL.EXAMPLE.TEST/// \n")).toBe(
      "https://signal.example.test",
    );
  });

  it("supports a local coordinator and a self-hosted path prefix", () => {
    expect(resolveCoordinatorBase("http://127.0.0.1:46330/")).toBe(
      "http://127.0.0.1:46330",
    );
    expect(resolveCoordinatorBase("https://signal.example.test/bonjou/")).toBe(
      "https://signal.example.test/bonjou",
    );
  });

  it.each([
    "/coordinator",
    "signal.example.test",
    "wss://signal.example.test",
    "ftp://signal.example.test",
    "https://user:password@signal.example.test",
    "https://signal.example.test?token=secret",
    "https://signal.example.test#fragment",
    "https://signal.example.test?",
    "https://signal.example.test#",
  ])("rejects unusable or sensitive endpoint configuration (%s)", (value) => {
    expect(() => resolveCoordinatorBase(value)).toThrow(/VITE_COORDINATOR_URL/);
  });
});
