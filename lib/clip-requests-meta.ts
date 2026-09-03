/**
 * Clip-request constants shared by server code and client components.
 *
 * Lives apart from `lib/clip-requests.ts` because that module imports the
 * MongoDB driver, which can't be pulled into a "use client" bundle. Same
 * split as `clipping-meta.ts` / `ideas-meta.ts`.
 */

export const REQUEST_STATUSES = [
  "queued",
  "processing",
  "done",
  "failed",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  queued: "Queued",
  processing: "Working on it",
  done: "Done",
  failed: "Failed",
};

/** The shape the API returns; mirrors ClipRequest in lib/clip-requests.ts. */
export type ClipRequest = {
  id: string;
  userId: string;
  userEmail: string;
  youtubeUrl: string;
  title: string;
  note: string;
  status: RequestStatus;
  sourceId: string;
  clipCount: number;
  error: string;
  createdAt: string;
  startedAt: string;
  completedAt: string;
};
