"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { SessionTable } from "@/components/session-table";
import {
  calculateTotals,
  currentState,
  formatDuration,
  type TimerState,
} from "@/lib/timer";
import {
  useWorkday,
  dispatchWorkday,
  type WorkdayAction,
} from "@/lib/workday-store";

function MetricCard({
  label,
  value,
  description,
  active,
  tone,
}: {
  label: string;
  value: string;
  description: string;
  active?: boolean;
  tone: "work" | "break" | "neutral";
}) {
  const toneClasses = {
    work: active
      ? "border-emerald-300 bg-emerald-50"
      : "border-slate-200 bg-white",
    break: active ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-white",
    neutral: "border-slate-200 bg-white",
  };

  return (
    <div className={`rounded-3xl border p-5 sm:p-6 ${toneClasses[tone]}`}>
      <div className="text-sm font-semibold text-slate-700">{label}</div>
      <div className="mt-1 text-xs text-slate-500">{description}</div>
      <div className="tabular mt-4 text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
        {value}
      </div>
    </div>
  );
}

export function WorkTimer() {
  const workday = useWorkday();
  const events = workday.events;
  const dayKey = workday.dateKey;
  const [now, setNow] = useState(() => Date.now());
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // The server snapshot has an empty dateKey until the client store attaches.
  const hydrated = dayKey !== "";

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, []);

  const totals = useMemo(() => calculateTotals(events, now), [events, now]);
  const state = currentState(events);

  async function performAction(action: WorkdayAction): Promise<string | null> {
    setPending(true);
    try {
      await dispatchWorkday(action);
      setNow(Date.now());
      setActionError(null);
      return null;
    } catch (error) {
      return error instanceof Error
        ? error.message
        : "Could not update the timer.";
    } finally {
      setPending(false);
    }
  }

  async function transition(next: TimerState) {
    setActionError(
      await performAction({ type: "transition", from: state, state: next }),
    );
  }

  function startDay() {
    return transition("work");
  }

  function toggleMode() {
    return transition(state === "work" ? "break" : "work");
  }

  function stopDay() {
    return transition("stopped");
  }

  function changeTimestamp(
    eventId: string,
    timestamp: number,
  ): Promise<string | null> {
    return performAction({ type: "edit", eventId, at: timestamp });
  }

  const currentLabel = state === "break" ? "Current Break" : "Current Session";
  const currentDescription =
    state === "stopped" ? "No active session" : "Time since last switch";

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-700">
            Work Timer
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            Focus without forced interruptions
          </h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Switch between work and break when it feels natural. Correct a
            missed switch later without manually rebalancing totals.
          </p>
        </div>

        <span
          className={`inline-flex w-fit items-center rounded-full px-3 py-1.5 text-sm font-bold ${
            state === "work"
              ? "bg-emerald-100 text-emerald-800"
              : state === "break"
                ? "bg-sky-100 text-sky-800"
                : "bg-slate-200 text-slate-700"
          }`}
        >
          {state === "work"
            ? "WORK MODE"
            : state === "break"
              ? "BREAK MODE"
              : "STOPPED"}
        </span>
      </header>

      <section className="rounded-[2rem] border border-slate-200 bg-white/85 p-4 shadow-xl shadow-slate-200/50 backdrop-blur sm:p-6">
        <MetricCard
          label="Today's Work"
          description="Total focused time"
          value={formatDuration(totals.workMs)}
          active={state === "work"}
          tone="work"
        />

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <MetricCard
            label={currentLabel}
            description={currentDescription}
            value={formatDuration(totals.currentMs)}
            active={state !== "stopped"}
            tone={state === "break" ? "break" : "work"}
          />
          <MetricCard
            label="Break Today"
            description="Total break time"
            value={formatDuration(totals.breakMs)}
            active={state === "break"}
            tone="break"
          />
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          {state === "stopped" ? (
            <Button
              variant="primary"
              className="flex-1 text-lg"
              onClick={startDay}
              disabled={!hydrated || pending}
            >
              Start Day
            </Button>
          ) : (
            <>
              <Button
                variant="primary"
                className="flex-1 text-lg"
                onClick={toggleMode}
                disabled={pending}
              >
                {state === "work" ? "Switch to Break" : "Back to Work"}
              </Button>
              <Button
                variant="danger"
                className="sm:min-w-40"
                onClick={stopDay}
                disabled={pending}
              >
                Stop Day
              </Button>
            </>
          )}
        </div>

        <p className="mt-4 text-sm text-slate-500">
          Every mode switch creates one timestamped state transition and starts
          a fresh current session.
        </p>

        {actionError ? (
          <p role="alert" className="mt-2 text-sm font-medium text-red-600">
            {actionError}
          </p>
        ) : null}
      </section>

      <div className="mt-6">
        <SessionTable
          events={events}
          now={now}
          onChangeTimestamp={changeTimestamp}
          pending={pending}
        />
      </div>
    </main>
  );
}
