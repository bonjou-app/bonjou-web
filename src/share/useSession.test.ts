import { describe, expect, it } from "vitest";

import { sanitizeFilename, sanitizePeerName } from "./useSession";

describe("direct profile names", () => {
  it("strips controls and limits untrusted peer names", () => {
    expect(sanitizePeerName("  Ada\n\u001b[31m  ")).toBe("Ada[31m");
    expect(sanitizePeerName("x".repeat(100))).toHaveLength(64);
    expect(sanitizePeerName("   ")).toBe("Nearby user");
  });
});

describe("download filenames", () => {
  it("preserves valid long filenames independently of display-name limits", () => {
    const filename = `${"handover-".repeat(20)}.txt`;
    expect(sanitizeFilename(filename)).toBe(filename);
    expect(sanitizeFilename("Nearby user")).toBe("Nearby user");
  });

  it("removes controls and path separators and uses a safe fallback", () => {
    expect(sanitizeFilename("  notes/plan\\final\u0000.txt  ")).toBe(
      "notes_plan_final.txt",
    );
    expect(sanitizeFilename("\n\u0000")).toBe("download");
    expect(sanitizeFilename("..")).toBe("download");
  });

  it("keeps the extension and whole Unicode characters at the filename cap", () => {
    const filename = sanitizeFilename(`${"📁".repeat(210)}.txt`);
    expect([...filename]).toHaveLength(200);
    expect(filename).toBe(`${"📁".repeat(196)}.txt`);
  });
});
