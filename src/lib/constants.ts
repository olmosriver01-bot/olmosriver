export type GlobalRole = "ADMIN" | "MANAGER" | "EMPLOYEE";
export type AuditStatus = "DRAFT" | "COMPLETED";
export type IssuePriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type IssueStatus = "NEW" | "PLANNED" | "IN_PROGRESS" | "REVIEW" | "DONE";

export const ROLE_LABELS: Record<GlobalRole, string> = {
  ADMIN: "Administrator",
  MANAGER: "Менеджер",
  EMPLOYEE: "Ходим",
};

export const ISSUE_PRIORITY_LABELS: Record<IssuePriority, string> = {
  CRITICAL: "Критик",
  HIGH: "Юқори",
  MEDIUM: "Ўртача",
  LOW: "Паст",
};

export const ISSUE_PRIORITY_ORDER: IssuePriority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  NEW: "Янги",
  PLANNED: "Режалаштирилган",
  IN_PROGRESS: "Жараёнда",
  REVIEW: "Текширувда",
  DONE: "Бажарилган",
};

export const ISSUE_STATUS_ORDER: IssueStatus[] = ["NEW", "PLANNED", "IN_PROGRESS", "REVIEW", "DONE"];
