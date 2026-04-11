import { describe, it, expect, beforeEach } from "vitest";
import { FakePhaseDetector } from "../../fixtures/factories.js";

describe("FakePhaseDetector", () => {
  it("returns the default result when no overrides are set", async () => {
    const detector = new FakePhaseDetector();
    const result = await detector.detect("my-feature");
    expect(result.startAtPhase).toBe("req-creation");
    expect(result.resolvedLifecycle).toBe("in-progress");
    expect(result.reqPresent).toBe(false);
    expect(result.overviewPresent).toBe(false);
  });

  it("returns a custom result when result is overridden", async () => {
    const detector = new FakePhaseDetector();
    detector.result = {
      startAtPhase: "req-review",
      resolvedLifecycle: "backlog",
      reqPresent: true,
      overviewPresent: false,
    };
    const result = await detector.detect("my-feature");
    expect(result.startAtPhase).toBe("req-review");
    expect(result.resolvedLifecycle).toBe("backlog");
    expect(result.reqPresent).toBe(true);
  });

  it("throws the detectError when set", async () => {
    const detector = new FakePhaseDetector();
    const error = new Error("EACCES: permission denied");
    detector.detectError = error;
    await expect(detector.detect("my-feature")).rejects.toThrow("EACCES: permission denied");
  });

  it("records all slug arguments passed to detect()", async () => {
    const detector = new FakePhaseDetector();
    await detector.detect("feature-alpha");
    await detector.detect("feature-beta");
    await detector.detect("feature-gamma");
    expect(detector.detectedSlugs).toEqual(["feature-alpha", "feature-beta", "feature-gamma"]);
  });

  it("records slug even when detectError is set", async () => {
    const detector = new FakePhaseDetector();
    detector.detectError = new Error("some error");
    await expect(detector.detect("failing-slug")).rejects.toThrow();
    expect(detector.detectedSlugs).toContain("failing-slug");
  });
});
