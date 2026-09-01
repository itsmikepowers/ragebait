"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  CLIP_RATINGS,
  CLIP_RATING_BY_VALUE,
  CLIP_REVIEW_STATUS_SPECS,
  CLIP_REVIEW_STATUS_BY_VALUE,
  clipRatingColor,
  suggestedReviewStatus,
  type ClipRating,
  type ClipReviewStatus,
} from "@/lib/clipping-meta";

/**
 * Owner review for a clip: a 1-5 "would I post this" picker plus free-text
 * feedback, both auto-saved.
 *
 * This is intentionally NOT the bot's virality `score`. It is a human verdict
 * and the feedback is the instruction a re-render reads, so both persist on
 * every clip row rather than living in local UI state.
 *
 * Saving rules learned the hard way:
 *  - The rating saves on click (instant, no debounce) — a click is a decision.
 *  - Feedback saves ~800ms after typing stops AND on blur, so a dialog closed
 *    immediately after typing doesn't drop the last keystrokes.
 *  - The textarea is uncontrolled-after-mount w.r.t. the server: we never
 *    overwrite what the user is typing with a stale response.
 */

type SaveState = "idle" | "saving" | "saved" | "error";

const FEEDBACK_DEBOUNCE_MS = 800;
const FEEDBACK_MAX = 4000;

export function RatingBadge({
  rating,
  className,
  size = "sm",
}: {
  rating: number;
  className?: string;
  size?: "sm" | "md";
}) {
  if (!rating) {
    return null;
  }
  const { bg, fg } = clipRatingColor(rating);
  const spec = CLIP_RATING_BY_VALUE[rating as ClipRating];
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md font-semibold tabular-nums ring-1 ring-white/30",
        size === "md"
          ? "min-w-9 px-1.5 py-0.5 text-sm"
          : "min-w-7 px-1 py-0.5 text-[11px]",
        className,
      )}
      style={{ backgroundColor: bg, color: fg }}
      title={spec ? `My rating ${rating}/5 — ${spec.label}` : `My rating ${rating}/5`}
    >
      {rating}
    </span>
  );
}

export function StatusBadge({
  status,
  className,
}: {
  status: ClipReviewStatus;
  className?: string;
}) {
  const spec = CLIP_REVIEW_STATUS_BY_VALUE[status];
  // "Needs review" is the default lane for everything, so badging it would
  // put a marker on nearly every card and say nothing. Only filed clips
  // carry a badge.
  if (!spec || status === "review") {
    return null;
  }
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-white/30",
        className,
      )}
      style={{ backgroundColor: spec.bg, color: spec.fg }}
      title={spec.meaning}
    >
      {status === "ready" ? "Good to go" : "Archived"}
    </span>
  );
}

export function ClipReview({
  clipId,
  rating,
  feedback,
  reviewStatus,
  onSaved,
}: {
  clipId: string;
  rating: number;
  feedback: string;
  reviewStatus: ClipReviewStatus;
  onSaved?: (patch: {
    rating?: number;
    feedback?: string;
    reviewStatus?: ClipReviewStatus;
  }) => void;
}) {
  const [localRating, setLocalRating] = useState(rating);
  const [localStatus, setLocalStatus] = useState<ClipReviewStatus>(reviewStatus);
  const [localFeedback, setLocalFeedback] = useState(feedback);
  const [state, setState] = useState<SaveState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // What we last successfully sent, so blur doesn't re-POST an unchanged value.
  const savedFeedback = useRef(feedback);

  // Switching to a different clip resets the form; editing the same clip does
  // not, so an in-flight response can't clobber live typing.
  useEffect(() => {
    setLocalRating(rating);
    setLocalStatus(reviewStatus);
    setLocalFeedback(feedback);
    savedFeedback.current = feedback;
    setState("idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipId]);

  const save = useCallback(
    async (body: {
      rating?: number;
      feedback?: string;
      reviewStatus?: ClipReviewStatus;
    }) => {
      setState("saving");
      try {
        const response = await fetch(`/api/clipping/${clipId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          setState("error");
          return;
        }
        if (body.feedback !== undefined) {
          savedFeedback.current = body.feedback;
        }
        setState("saved");
        onSaved?.(body);
      } catch {
        setState("error");
      }
    },
    [clipId, onSaved],
  );

  function pick(value: number) {
    // Clicking the active number clears the rating back to "not reviewed".
    const next = localRating === value ? 0 : value;
    setLocalRating(next);
    // Rating a clip files it in one motion: a 5 is good to go, a 1 or 2 is
    // archived, anything else stays in review. Only auto-file on a real
    // rating, and never override a lane that was already set by hand.
    const suggested = next ? suggestedReviewStatus(next) : null;
    const shouldFile =
      suggested !== null && suggested !== localStatus && localStatus === "review";
    if (shouldFile) {
      setLocalStatus(suggested);
      save({ rating: next, reviewStatus: suggested });
    } else {
      save({ rating: next });
    }
  }

  function setStatus(value: ClipReviewStatus) {
    if (value === localStatus) return;
    setLocalStatus(value);
    save({ reviewStatus: value });
  }

  function onFeedbackChange(value: string) {
    setLocalFeedback(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      save({ feedback: value });
    }, FEEDBACK_DEBOUNCE_MS);
  }

  function flush() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (localFeedback !== savedFeedback.current) {
      save({ feedback: localFeedback });
    }
  }

  // A dialog can unmount mid-debounce; fire the pending write on the way out.
  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        if (localFeedback !== savedFeedback.current) {
          fetch(`/api/clipping/${clipId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ feedback: localFeedback }),
            keepalive: true,
          }).catch(() => undefined);
        }
      }
    };
  }, [clipId, localFeedback]);

  const activeSpec = localRating
    ? CLIP_RATING_BY_VALUE[localRating as ClipRating]
    : null;

  return (
    <div className="grid gap-2 rounded-lg border border-black/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          My rating
        </span>
        <span
          className={cn(
            "text-[11px] transition-opacity",
            state === "idle" ? "opacity-0" : "opacity-100",
            state === "error" ? "text-red-600" : "text-muted-foreground",
          )}
          aria-live="polite"
        >
          {state === "saving"
            ? "Saving…"
            : state === "saved"
              ? "Saved"
              : state === "error"
                ? "Not saved"
                : ""}
        </span>
      </div>

      <div className="flex gap-1.5">
        {CLIP_RATINGS.map((spec) => {
          const active = localRating === spec.value;
          const { bg, fg } = clipRatingColor(spec.value);
          return (
            <button
              key={spec.value}
              type="button"
              onClick={() => pick(spec.value)}
              title={`${spec.value} — ${spec.label}: ${spec.meaning}`}
              aria-pressed={active}
              className={cn(
                "h-9 flex-1 cursor-pointer rounded-md border text-sm font-semibold tabular-nums transition-colors",
                active
                  ? "border-transparent"
                  : "border-input text-muted-foreground hover:bg-black/5 hover:text-foreground",
              )}
              style={active ? { backgroundColor: bg, color: fg } : undefined}
            >
              {spec.value}
            </button>
          );
        })}
      </div>

      <p className="min-h-4 text-[11px] text-muted-foreground">
        {activeSpec ? activeSpec.meaning : "1 = unusable · 5 = would post as-is"}
      </p>

      <span className="mt-1 text-xs font-medium text-muted-foreground">
        Status
      </span>
      <div className="flex gap-1.5">
        {CLIP_REVIEW_STATUS_SPECS.map((spec) => {
          const active = localStatus === spec.value;
          return (
            <button
              key={spec.value}
              type="button"
              onClick={() => setStatus(spec.value)}
              title={spec.meaning}
              aria-pressed={active}
              className={cn(
                "h-8 flex-1 cursor-pointer rounded-md border px-2 text-xs font-medium transition-colors",
                active
                  ? "border-transparent"
                  : "border-input text-muted-foreground hover:bg-black/5 hover:text-foreground",
              )}
              style={
                active ? { backgroundColor: spec.bg, color: spec.fg } : undefined
              }
            >
              {spec.label}
            </button>
          );
        })}
      </div>

      <label
        htmlFor={`review-feedback-${clipId}`}
        className="mt-1 text-xs font-medium text-muted-foreground"
      >
        Feedback
      </label>
      <textarea
        id={`review-feedback-${clipId}`}
        value={localFeedback}
        onChange={(event) => onFeedbackChange(event.target.value)}
        onBlur={flush}
        placeholder="What would you change? This is what a re-render gets told."
        maxLength={FEEDBACK_MAX}
        rows={4}
        className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
      />
    </div>
  );
}
