import { describe, expect, it } from "vitest";
import { CLI_FAILURE_KEEP_MS, cliFailureCutoff } from "../../src/store/retention.js";

describe("how long failures of the exchange are kept", () => {
  it("is an hour", () => {
    expect(CLI_FAILURE_KEEP_MS).toBe(3_600_000);
  });

  it("puts the cutoff exactly an hour before the failure, as an ISO time with milliseconds", () => {
    expect(cliFailureCutoff("2026-10-14T12:00:00.000Z")).toBe("2026-10-14T11:00:00.000Z");
    expect(cliFailureCutoff("2026-10-14T12:00:00.123Z")).toBe("2026-10-14T11:00:00.123Z");
    expect(cliFailureCutoff("2026-01-01T00:30:00.000Z")).toBe("2025-12-31T23:30:00.000Z");
  });

  it("reads a time written without milliseconds and still answers in the one format", () => {
    expect(cliFailureCutoff("2026-10-14T12:00:00Z")).toBe("2026-10-14T11:00:00.000Z");
  });

  it("throws for something that is not a time, so a mistake is not silently kept", () => {
    expect(() => cliFailureCutoff("not a time")).toThrow(RangeError);
    expect(() => cliFailureCutoff("")).toThrow(RangeError);
  });
});
