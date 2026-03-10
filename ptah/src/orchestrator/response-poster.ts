import type { PostResult, PtahConfig } from "../types.js";

export interface ResponsePoster {
  postAgentResponse(params: {
    threadId: string;
    agentId: string;
    text: string;
    config: PtahConfig;
    footer?: string;
  }): Promise<PostResult>;

  postCompletionEmbed(threadId: string, agentId: string, config: PtahConfig): Promise<void>;
  postErrorEmbed(threadId: string, errorMessage: string): Promise<void>;

  createCoordinationThread(params: {
    channelId: string;
    featureName: string;
    description: string;
    agentId: string;
    initialText: string;
    config: PtahConfig;
  }): Promise<string>;
}
