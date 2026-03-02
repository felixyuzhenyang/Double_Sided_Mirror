export type RoleMode = "citizen" | "staff";

export type SessionStatus = "active" | "closed";
export type CitizenStage =
  | "intake"
  | "research"
  | "refine"
  | "final_check"
  | "identity_check"
  | "identity_input"
  | "complete";
export type CaseStatus = "new" | "in_review" | "responded";

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

export interface Citation {
  title: string;
  url: string;
  agency: string;
  publishedOrUpdated: string;
  snippet: string;
}

export interface ActionStep {
  order: number;
  title: string;
  details: string;
  timing: string;
  materials: string[];
  agency: string;
}

export interface CitizenResult {
  summary: string;
  actionPlan: ActionStep[];
  citations: Citation[];
  flowchartMermaid: string;
  riskNotice: string;
}

export interface CitizenMeta {
  stage: CitizenStage;
  intentCategory: string;
  intentTitle: string;
  details: Record<string, string>;
  followUpQuestions: string[];
  followUpAnswers: Record<string, string>;
  followUpIndex: number;
  policySummary: string;
  policyCitations: Citation[];
  liveSearchUsed: boolean;
  citizenDisplayName: string;
  pendingField?: string;
  finalSupplement: string;
  result?: CitizenResult;
}

export interface ConversationSession {
  id: string;
  mode: RoleMode;
  actorId: string;
  createdAt: string;
  updatedAt: string;
  status: SessionStatus;
  transcript: Message[];
  citizenMeta?: CitizenMeta;
}

export interface CaseRecord {
  id: string;
  citizenSessionId: string;
  citizenDisplayName: string;
  intentTitle: string;
  citizenSummary: string;
  transcript: Message[];
  actionPlan: ActionStep[];
  flowchartMermaid: string;
  citations: Citation[];
  syncConsent: boolean;
  syncConsentAt: string | null;
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StaffResponse {
  id: string;
  caseId: string;
  staffActorId: string;
  aiDraft: string;
  humanResponse: string;
  publishedAt: string;
}

export interface AuditEvent {
  id: string;
  eventType:
    | "session_start"
    | "citizen_message"
    | "citizen_result"
    | "case_sync"
    | "staff_draft"
    | "staff_publish";
  actorId: string;
  caseId: string | null;
  sessionId: string | null;
  timestamp: string;
  metadata: Record<string, string | number | boolean | null>;
}

export interface RuntimeDb {
  sessions: ConversationSession[];
  cases: CaseRecord[];
  responses: StaffResponse[];
  auditEvents: AuditEvent[];
}
