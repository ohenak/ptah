import { describe, it, expect, beforeEach, vi } from "vitest";
import { DefaultPhaseDetector } from "../../../src/orchestrator/phase-detector.js";
import { FakeFileSystem, FakeLogger } from "../../fixtures/factories.js";

describe("DefaultPhaseDetector", () => {
  const slug = "my-feature";
  const ipReqPath = `docs/in-progress/${slug}/REQ-${slug}.md`;
  const blReqPath = `docs/backlog/${slug}/REQ-${slug}.md`;
  const ipOverviewPath = `docs/in-progress/${slug}/overview.md`;
  const blOverviewPath = `docs/backlog/${slug}/overview.md`;
  const ipDir = `docs/in-progress/${slug}/`;
  const blDir = `docs/backlog/${slug}/`;

  let fs: FakeFileSystem;
  let logger: FakeLogger;
  let detector: DefaultPhaseDetector;

  beforeEach(() => {
    fs = new FakeFileSystem();
    logger = new FakeLogger();
    detector = new DefaultPhaseDetector(fs, logger);
  });

  it("returns req-review and in-progress when REQ exists in in-progress folder", async () => {
    fs.existsResults.set(ipReqPath, true);
    const result = await detector.detect(slug);
    expect(result.startAtPhase).toBe("req-review");
    expect(result.resolvedLifecycle).toBe("in-progress");
    expect(result.reqPresent).toBe(true);
  });

  it("returns req-review and backlog when REQ exists in backlog folder only", async () => {
    fs.existsResults.set(blReqPath, true);
    const result = await detector.detect(slug);
    expect(result.startAtPhase).toBe("req-review");
    expect(result.resolvedLifecycle).toBe("backlog");
    expect(result.reqPresent).toBe(true);
  });

  it("returns req-creation and in-progress when overview exists in in-progress only, no REQ", async () => {
    fs.existsResults.set(ipOverviewPath, true);
    const result = await detector.detect(slug);
    expect(result.startAtPhase).toBe("req-creation");
    expect(result.resolvedLifecycle).toBe("in-progress");
    expect(result.overviewPresent).toBe(true);
  });

  it("returns req-creation and backlog when overview exists in backlog only, no REQ", async () => {
    fs.existsResults.set(blOverviewPath, true);
    const result = await detector.detect(slug);
    expect(result.startAtPhase).toBe("req-creation");
    expect(result.resolvedLifecycle).toBe("backlog");
    expect(result.overviewPresent).toBe(true);
  });

  it("returns req-creation and in-progress when neither REQ nor overview exists anywhere", async () => {
    // REQ-NF-02 scenario 4: PM Phase 0 bootstrap not disrupted (REQ-WS-02, REQ-PD-04)
    // Read-only invariant additionally asserted in test #9
    const result = await detector.detect(slug);
    expect(result.startAtPhase).toBe("req-creation");
    expect(result.resolvedLifecycle).toBe("in-progress");
    expect(result.reqPresent).toBe(false);
    expect(result.overviewPresent).toBe(false);
  });

  it("Case B: overview in in-progress + REQ and overview in backlog → backlog, req-review, warning with both paths", async () => {
    // Case B: inProgressReq=false, inProgressOverview=true, backlogReq=true, backlogOverview=true
    fs.existsResults.set(ipOverviewPath, true);
    fs.existsResults.set(blReqPath, true);
    fs.existsResults.set(blOverviewPath, true);
    const result = await detector.detect(slug);
    expect(result.startAtPhase).toBe("req-review");
    expect(result.resolvedLifecycle).toBe("backlog");
    const warnEntries = logger.entriesAt("WARN");
    expect(warnEntries).toHaveLength(1);
    const warnMsg = warnEntries[0].message;
    expect(warnMsg).toContain(slug);
    expect(warnMsg).toContain(ipDir);
    expect(warnMsg).toContain(blDir);
  });

  it("Case C: REQ in both in-progress and backlog → in-progress, req-review, warning with both paths", async () => {
    // Case C: inProgressReq=true, backlogReq=true
    fs.existsResults.set(ipReqPath, true);
    fs.existsResults.set(blReqPath, true);
    const result = await detector.detect(slug);
    expect(result.startAtPhase).toBe("req-review");
    expect(result.resolvedLifecycle).toBe("in-progress");
    const warnEntries = logger.entriesAt("WARN");
    expect(warnEntries).toHaveLength(1);
    const warnMsg = warnEntries[0].message;
    expect(warnMsg).toContain(slug);
    expect(warnMsg).toContain(ipDir);
    expect(warnMsg).toContain(blDir);
  });

  it("Case H: overview in both folders, no REQ → in-progress, req-creation, warning with both paths", async () => {
    // Case H: inProgressReq=false, backlogReq=false, inProgressOverview=true, backlogOverview=true
    fs.existsResults.set(ipOverviewPath, true);
    fs.existsResults.set(blOverviewPath, true);
    const result = await detector.detect(slug);
    expect(result.startAtPhase).toBe("req-creation");
    expect(result.resolvedLifecycle).toBe("in-progress");
    const warnEntries = logger.entriesAt("WARN");
    expect(warnEntries).toHaveLength(1);
    const warnMsg = warnEntries[0].message;
    expect(warnMsg).toContain(slug);
    expect(warnMsg).toContain(ipDir);
    expect(warnMsg).toContain(blDir);
  });

  it("makes no write, rename, copy, mkdir, or appendFile calls during detection (read-only invariant)", async () => {
    const writeFileSpy = vi.spyOn(fs, "writeFile");
    const renameSpy = vi.spyOn(fs, "rename");
    const copyFileSpy = vi.spyOn(fs, "copyFile");
    const mkdirSpy = vi.spyOn(fs, "mkdir");
    const appendFileSpy = vi.spyOn(fs, "appendFile");
    fs.existsResults.set(ipReqPath, true);
    await detector.detect(slug);
    expect(writeFileSpy).not.toHaveBeenCalled();
    expect(renameSpy).not.toHaveBeenCalled();
    expect(copyFileSpy).not.toHaveBeenCalled();
    expect(mkdirSpy).not.toHaveBeenCalled();
    expect(appendFileSpy).not.toHaveBeenCalled();
  });

  it("structured log entry contains slug, lifecycle, reqPresent, overviewPresent, startAtPhase fields", async () => {
    fs.existsResults.set(blReqPath, true);
    await detector.detect(slug);
    const infoEntries = logger.entriesAt("INFO");
    expect(infoEntries).toHaveLength(1);
    const msg = infoEntries[0].message;
    expect(msg).toContain(`slug=${slug}`);
    expect(msg).toContain("lifecycle=");
    expect(msg).toContain("reqPresent=");
    expect(msg).toContain("overviewPresent=");
    expect(msg).toContain("startAtPhase=");
  });

  it("propagates error thrown by FileSystem.exists() without catching", async () => {
    const ioError = Object.assign(new Error("Permission denied"), { code: "EACCES" });
    fs.existsError = ioError;
    await expect(detector.detect(slug)).rejects.toThrow("Permission denied");
  });
});
