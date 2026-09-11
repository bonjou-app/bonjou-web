import { describe, expect, it } from "vitest";

import { sanitizePeerName } from "./useSession";

describe("direct profile names", () => {
  it("strips controls and limits untrusted peer names", () => {
    expect(sanitizePeerName("  Ada\n\u001b[31m  ")).toBe("Ada[31m");
    expect(sanitizePeerName("x".repeat(100))).toHaveLength(64);
    expect(sanitizePeerName("   ")).toBe("Nearby user");
  });
});
