import type { ApiErrorShape } from "./api";

export type ConversationType = "understand" | "decide";

export type CreateConversationRequest = {
  hiveId: string;
  type: ConversationType;
  title: string;
  description?: string;
  // Decision session fields (optional report linking)
  sourceConversationId?: string;
  sourceReportVersion?: number;
};

export type CreateConversationResponse = {
  id: string;
};

export type UploadConversationCsvResponse = {
  importedCount: number;
};

export type TriggerConversationAnalysisResponse = {
  status: "queued" | "already_running" | "already_complete";
};

export type ConversationsApiError = ApiErrorShape;
