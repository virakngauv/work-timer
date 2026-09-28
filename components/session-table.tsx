"use client";

import { Fragment, useState } from "react";
import {
  deriveSegments,
  formatClockTime,
  formatDuration,
  fromLocalDateTimeInput,
  toLocalDateTimeInput,
  type TimerEvent,
} from "@/lib/timer";
import { Button } from "@/components/ui/button";

interface SessionTableProps {
  events: TimerEvent[];
  now: number;
  onChangeTimestamp: (eventId: string, timestamp: number) => string | null;
}

export function SessionTable({
  events,
  now,
  onChangeTimestamp,
}: SessionTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const segments = deriveSegments(events, now);

  // Adjust state during render (instead of in an effect) so an open editor
  // follows boundary corrections made outside of it.
  const editingEvent = editingId
    ? events.find((item) => item.id === editingId)
    : undefined;
  if (editingEvent && editingEvent.at !== syncedAt) {
    setSyncedAt(editingEvent.at);
    setDraft(toLocalDateTimeInput(editingEvent.at));
  }

  function openEditor(eventId: string) {
    const event = events.find((item) => item.id === eventId);
    if (!event) return;
    setEditingId(eventId);
    setDraft(toLocalDateTimeInput(event.at));
    setError(null);
  }

  function adjust(minutes: number) {
    const timestamp = fromLocalDateTimeInput(draft);
    setDraft(toLocalDateTimeInput(timestamp + minutes * 60_000));
    setError(null);
  }

  function save() {
    if (!editingId) return;
    const timestamp = fromLocalDateTimeInput(draft);
    if (!Number.isFinite(timestamp)) {
      setError("Enter a valid date and time.");
      return;
    }

    const result = onChangeTimestamp(editingId, timestamp);
    if (result) {
      setError(result);
      return;
    }

    setEditingId(null);
    setError(null);
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4 sm:px-7">
        <h2 className="text-lg font-bold text-slate-950">
          Today&apos;s Sessions
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Edit a start boundary to correct a forgotten mode switch.
        </p>
      </div>

      {segments.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-slate-500">
          Start your day to create the first session.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-left">
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 sm:px-7">Mode</th>
                <th className="px-5 py-3">Started</th>
                <th className="px-5 py-3">Ended</th>
                <th className="px-5 py-3">Duration</th>
                <th className="px-5 py-3 text-right sm:px-7">Action</th>
              </tr>
            </thead>
            <tbody>
              {segments.map((segment) => (
                <Fragment key={segment.eventId}>
                  <tr className="border-t border-slate-100 text-sm text-slate-800">
                    <td className="px-5 py-4 sm:px-7">
                      <span
                        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 font-semibold ${
                          segment.state === "work"
                            ? "bg-emerald-50 text-emerald-800"
                            : "bg-sky-50 text-sky-800"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`h-2 w-2 rounded-full ${
                            segment.state === "work"
                              ? "bg-emerald-500"
                              : "bg-sky-500"
                          }`}
                        />
                        {segment.state === "work" ? "Work" : "Break"}
                        {segment.active ? " · active" : ""}
                      </span>
                    </td>
                    <td className="tabular px-5 py-4">
                      {formatClockTime(segment.startedAt)}
                    </td>
                    <td className="tabular px-5 py-4">
                      {segment.endedAt
                        ? formatClockTime(segment.endedAt)
                        : "Now"}
                    </td>
                    <td className="tabular px-5 py-4 font-semibold">
                      {formatDuration(segment.durationMs)}
                    </td>
                    <td className="px-5 py-4 text-right sm:px-7">
                      <Button
                        variant="ghost"
                        aria-expanded={editingId === segment.eventId}
                        onClick={() => openEditor(segment.eventId)}
                      >
                        Edit
                      </Button>
                    </td>
                  </tr>

                  {editingId === segment.eventId ? (
                    <tr className="border-t border-slate-100 bg-slate-50">
                      <td colSpan={5} className="px-5 py-5 sm:px-7">
                        <div className="flex flex-col gap-4">
                          <div>
                            <div className="font-semibold text-slate-900">
                              Adjust{" "}
                              {segment.state === "work" ? "work" : "break"}{" "}
                              start
                            </div>
                            <p className="mt-1 text-sm text-slate-500">
                              Changing this boundary also changes the end of the
                              previous active session when they are adjacent.
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {[-5, -1, 1, 5].map((minutes) => (
                              <Button
                                key={minutes}
                                variant="secondary"
                                onClick={() => adjust(minutes)}
                              >
                                {minutes > 0 ? "+" : ""}
                                {minutes} min
                              </Button>
                            ))}
                          </div>

                          <label className="max-w-sm">
                            <span className="mb-1 block text-sm font-medium text-slate-700">
                              Exact start time
                            </span>
                            <input
                              type="datetime-local"
                              value={draft}
                              onChange={(event) => {
                                setDraft(event.target.value);
                                setError(null);
                              }}
                              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900"
                            />
                          </label>

                          {error ? (
                            <p
                              role="alert"
                              className="text-sm font-medium text-red-600"
                            >
                              {error}
                            </p>
                          ) : null}

                          <div className="flex gap-2">
                            <Button variant="primary" onClick={save}>
                              Save
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => {
                                setEditingId(null);
                                setError(null);
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
