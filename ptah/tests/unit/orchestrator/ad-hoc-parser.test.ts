import { describe, it, expect } from "vitest";
import { parseAdHocDirective } from "../../../src/orchestrator/ad-hoc-parser.js";

describe("parseAdHocDirective", () => {
  it("returns directive when first token starts with @", () => {
    const result = parseAdHocDirective("@pm address feedback from CROSS-REVIEW");
    expect(result).not.toBeNull();
    expect(result!.agentIdentifier).toBe("pm");
    expect(result!.instruction).toBe("address feedback from CROSS-REVIEW");
  });

  it("returns null when first token does not start with @", () => {
    const result = parseAdHocDirective("The issue is that @pm wrote conflicting docs");
    expect(result).toBeNull();
  });

  it("lowercases the agent identifier", () => {
    const result = parseAdHocDirective("@PM update the REQ");
    expect(result).not.toBeNull();
    expect(result!.agentIdentifier).toBe("pm");
  });

  it("trims the instruction remainder", () => {
    const result = parseAdHocDirective("@eng   update the TSPEC   ");
    expect(result).not.toBeNull();
    expect(result!.instruction).toBe("update the TSPEC");
  });

  it("returns empty instruction when only @agent is sent", () => {
    const result = parseAdHocDirective("@pm");
    expect(result).not.toBeNull();
    expect(result!.agentIdentifier).toBe("pm");
    expect(result!.instruction).toBe("");
  });

  it("strips leading whitespace before extracting first token", () => {
    const result = parseAdHocDirective("   @qa run the tests");
    expect(result).not.toBeNull();
    expect(result!.agentIdentifier).toBe("qa");
    expect(result!.instruction).toBe("run the tests");
  });

  it("treats only first @token as directive, rest is instruction", () => {
    const result = parseAdHocDirective("@pm @eng update the docs");
    expect(result).not.toBeNull();
    expect(result!.agentIdentifier).toBe("pm");
    expect(result!.instruction).toBe("@eng update the docs");
  });
});
