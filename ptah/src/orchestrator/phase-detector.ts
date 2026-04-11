export interface PhaseDetectionResult {
  startAtPhase: "req-review" | "req-creation";
  resolvedLifecycle: "in-progress" | "backlog";
  reqPresent: boolean;
  overviewPresent: boolean;
}

export interface PhaseDetector {
  detect(slug: string): Promise<PhaseDetectionResult>;
}
