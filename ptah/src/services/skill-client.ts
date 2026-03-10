import type { SkillRequest, SkillResponse } from "../types.js";

export interface SkillClient {
  invoke(request: SkillRequest): Promise<SkillResponse>;
}
