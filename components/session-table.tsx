"use client";

import { useEffect, useRef, useState } from "react";
import {
  deriveSegments,
  editEventTimestamp,
  formatTimeRange,
  formatClockTime,
  formatSessionDuration,
  fromLocalDateTimeInput,
  toLocalDateTimeInput,
  type TimerEvent,
} from "@/lib/timer";
import { Button } from "@/components/ui/button";

interface SessionTableProps {
  events: TimerEvent[];
  now: number;
  onChangeTimestamp: (
    eventId: string,
    timestamp: number,
  ) => Promise<string | null>;
  pending: boolean;
}

export function SessionTable({
  events,
  now,
  onChangeTimestamp,
  pending,
}: SessionTableProps) {
  const [editor, setEditor] = useState<{
    sessionId: string;
    field: "start" | "end";
  } | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const segments = deriveSegments(events, now).toReversed();
  const segmentsById = new Map(
    segments.map((segment) => [segment.eventId, segment]),
  );
  const sessionNumbers = new Map(
    segments.map((segment, index) => [
      segment.eventId,
      segments.length - index,
    ]),
  );
  const session = segments.find(
    (segment) => segment.eventId === editor?.sessionId,
  );
  const sessionIndex = events.findIndex(
    (event) => event.id === editor?.sessionId,
  );
  const editingEvent =
    editor && sessionIndex >= 0
      ? events[sessionIndex + (editor.field === "end" ? 1 : 0)]
      : undefined;

  if (editor && !session) {
    setEditor(null);
    setError(null);
  }

  // Follow boundary corrections from another tab without discarding local drafts on every tick.
  if (editingEvent && editingEvent.at !== syncedAt) {
    setSyncedAt(editingEvent.at);
    setDraft(toLocalDateTimeInput(editingEvent.at));
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (editor && dialog && !dialog.open) dialog.showModal();
    if (editor) inputRef.current?.focus();
    else if (dialog?.open) {
      dialog.close();
      sectionRef.current?.focus();
    }
  }, [editor]);

  function closeEditor() {
    dialogRef.current?.close();
    setEditor(null);
    setError(null);
    triggerRef.current?.focus();
  }

  function selectField(field: "start" | "end", sessionId = editor?.sessionId) {
    if (!sessionId) return;
    const index = events.findIndex((event) => event.id === sessionId);
    const event = events[index + (field === "end" ? 1 : 0)];
    if (!event) return;
    setEditor({ sessionId, field });
    setSyncedAt(event.at);
    setDraft(toLocalDateTimeInput(event.at));
    setError(null);
  }

  function adjust(minutes: number) {
    const timestamp = fromLocalDateTimeInput(draft);
    if (!Number.isFinite(timestamp)) {
      setError("Enter a valid date and time.");
      return;
    }
    setDraft(toLocalDateTimeInput(timestamp + minutes * 60_000));
    setError(null);
  }

  async function save() {
    if (!editingEvent) return;
    // Display whole seconds while retaining the shared boundary's precision.
    const timestamp =
      fromLocalDateTimeInput(draft) +
      new Date(editingEvent.at).getMilliseconds();
    let result: string | null;
    try {
      if (!Number.isFinite(timestamp))
        throw new Error("Enter a valid date and time.");
      if (timestamp > now)
        throw new Error("Session times cannot be in the future.");
      editEventTimestamp(events, editingEvent.id, timestamp);
      // The store validates again against the latest persisted events, including other tabs.
      result = await onChangeTimestamp(editingEvent.id, timestamp);
    } catch (error) {
      result =
        error instanceof Error ? error.message : "Unable to save this time.";
    }
    if (result) {
      setError(
        editor?.field === "end"
          ? result.replace("Start time", "End time")
          : result,
      );
      return;
    }
    closeEditor();
  }

  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      aria-label="Sessions"
      className="session-history rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      {segments.length === 0 ? (
        <div className="px-3 py-6 text-center text-sm text-slate-500">
          No sessions yet. Start work or a break to begin.
        </div>
      ) : (
        <div
          className="session-table-scroll"
          tabIndex={0}
          role="region"
          aria-label="Session history table"
        >
          <table role="table" aria-label="Sessions" className="session-table">
            <thead role="rowgroup">
              <tr role="row" className="session-head">
                <th role="columnheader" scope="col">
                  Mode
                </th>
                <th role="columnheader" scope="col">
                  Start / End
                </th>
                <th role="columnheader" scope="col">
                  Duration
                </th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {events.toReversed().map((event) => {
                if (event.state === "stopped") {
                  return (
                    <tr role="row" key={event.id} className="session-stop-row">
                      <td role="cell" colSpan={3} className="session-stop-cell">
                        Timer stopped ·{" "}
                        <time
                          dateTime={new Date(event.at).toISOString()}
                          title={new Date(event.at).toLocaleString()}
                        >
                          {formatClockTime(event.at)}
                        </time>
                      </td>
                    </tr>
                  );
                }
                const segment = segmentsById.get(event.id)!;
                return (
                  <tr role="row" key={segment.eventId} className="session-row">
                    <td role="cell" className="session-mode">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-1 font-semibold ${segment.state === "work" ? "bg-emerald-50 text-emerald-800" : "bg-sky-50 text-sky-800"}`}
                      >
                        {segment.state === "work" ? "Work" : "Break"}
                      </span>
                    </td>
                    <td
                      role="cell"
                      className="time-cell"
                      title={`${new Date(segment.startedAt).toLocaleString()} – ${segment.endedAt !== null ? new Date(segment.endedAt).toLocaleString() : "Not ended"}`}
                    >
                      {formatTimeRange(segment.startedAt, segment.endedAt)}
                    </td>
                    <td role="cell" className="session-duration tabular">
                      <button
                        type="button"
                        className="duration-edit-button"
                        aria-label={`Edit ${segment.state} session ${sessionNumbers.get(segment.eventId)}, started ${new Date(segment.startedAt).toLocaleString()}`}
                        aria-haspopup="dialog"
                        disabled={pending}
                        onClick={(event) => {
                          triggerRef.current = event.currentTarget;
                          selectField("start", segment.eventId);
                        }}
                      >
                        <span>{formatSessionDuration(segment.durationMs)}</span>
                        <svg
                          className="time-edit-icon"
                          aria-hidden="true"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.75"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="m16 3 5 5L8 21H3v-5L16 3Z" />
                          <path d="m14 5 5 5" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <dialog
        ref={dialogRef}
        className="session-dialog"
        aria-labelledby="session-dialog-title"
        aria-describedby="session-dialog-description"
        onCancel={(event) => {
          event.preventDefault();
          if (!pending) closeEditor();
        }}
      >
        {editor && session ? (
          <form
            className="flex min-w-0 flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <h2 id="session-dialog-title" className="text-lg font-semibold">
              Edit {session.state} session
            </h2>
            <div
              className="grid grid-cols-2 gap-2"
              role="group"
              aria-label="Time to edit"
            >
              <Button
                aria-pressed={editor.field === "start"}
                disabled={pending}
                onClick={() => selectField("start")}
                variant={editor.field === "start" ? "primary" : "secondary"}
              >
                Start
              </Button>
              <Button
                aria-pressed={editor.field === "end"}
                disabled={pending || session.endedAt === null}
                onClick={() => selectField("end")}
                variant={editor.field === "end" ? "primary" : "secondary"}
              >
                End
              </Button>
            </div>
            <p
              id="session-dialog-description"
              className="text-sm text-slate-600"
            >
              {editor.field === "start"
                ? "Changing the start may also update the previous session’s end."
                : "Changing the end may also update the next session’s start."}
              {session.endedAt === null
                ? " This session is still running."
                : ""}
            </p>
            <label className="min-w-0">
              <span className="mb-1 block text-sm font-medium">
                Exact {editor.field} time
              </span>
              <input
                ref={inputRef}
                type="datetime-local"
                required
                step="1"
                disabled={pending}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setError(null);
                }}
                className="w-full min-w-0 max-w-full rounded-xl border border-slate-500 bg-white px-3 py-2.5"
                aria-invalid={!!error}
                aria-describedby={error ? "session-edit-error" : undefined}
              />
            </label>
            <div className="correction-controls">
              {[-5, -1, 1, 5].map((minutes) => (
                <Button
                  disabled={pending}
                  key={minutes}
                  onClick={() => adjust(minutes)}
                >
                  {minutes > 0 ? "+" : ""}
                  {minutes} min
                </Button>
              ))}
            </div>
            {error ? (
              <p
                id="session-edit-error"
                role="alert"
                className="text-sm font-medium text-red-700"
              >
                {error}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button type="submit" disabled={pending} variant="neutral">
                Save
              </Button>
              <Button disabled={pending} variant="ghost" onClick={closeEditor}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}
      </dialog>
    </section>
  );
}
