"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SessionTable } from "@/components/session-table";
import {
  calculateTotals,
  currentState,
  formatDuration,
  type TimerEvent,
  type TimerState,
} from "@/lib/timer";
import { useTimer, dispatchTimer, type TimerAction } from "@/lib/timer-store";

function durationLabel(value: string): string {
  const [hours, minutes, seconds] = value.split(":").map(Number);
  return `${hours} hours, ${minutes} minutes, ${seconds} seconds`;
}

function MetricCard({
  label,
  value,
  active,
  tone,
  prominent = false,
}: {
  label: string;
  value: string;
  active?: boolean;
  tone: "work" | "break" | "neutral";
  prominent?: boolean;
}) {
  const toneClasses = {
    work: active
      ? "border-emerald-300 bg-emerald-50"
      : "border-slate-200 bg-white",
    break: active ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-white",
    neutral: "border-slate-200 bg-white",
  };

  return (
    <div
      className={`@container min-w-0 rounded-2xl border ${prominent ? "current-metric" : "total-metric"} ${toneClasses[tone]}`}
    >
      <div className="text-sm font-semibold text-slate-700">{label}</div>
      <div
        className={`timer-value tabular ${prominent ? "current-value" : "total-value"}`}
        role={prominent ? "timer" : undefined}
        aria-live={prominent ? "off" : undefined}
        aria-label={`${label}: ${durationLabel(value)}`}
      >
        {value.split(":").map((part, index) => (
          <span key={index}>
            {part}
            {index < 2 ? ":" : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

export function WorkTimer() {
  const history = useTimer();
  const events = history.events;
  const state = currentState(events);
  const [now, setNow] = useState(() => Date.now());
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [clearEvents, setClearEvents] = useState<TimerEvent[] | null>(null);
  const [clearError, setClearError] = useState<string | null>(null);
  const clearDialogRef = useRef<HTMLDialogElement>(null);
  const clearDialogOpenRef = useRef(false);
  const cancelClearRef = useRef<HTMLButtonElement>(null);
  const clearTriggerRef = useRef<HTMLButtonElement>(null);
  const restoreClearFocusRef = useRef(false);
  const clearedRef = useRef(false);
  const startWorkRef = useRef<HTMLButtonElement>(null);
  const timerSurfaceRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (clearEvents && !clearDialogRef.current?.open) {
      clearDialogOpenRef.current = true;
      clearDialogRef.current?.showModal();
      cancelClearRef.current?.focus();
    }
  }, [clearEvents]);

  useEffect(() => {
    if (!clearEvents && !pending && restoreClearFocusRef.current) {
      const target = (clearedRef.current ? startWorkRef : clearTriggerRef)
        .current;
      (target ?? timerSurfaceRef.current)?.focus();
      restoreClearFocusRef.current = false;
    }
  }, [clearEvents, pending]);

  function closeClearDialog(cleared = false) {
    restoreClearFocusRef.current = true;
    clearedRef.current = cleared;
    clearDialogOpenRef.current = false;
    clearDialogRef.current?.close();
    setClearEvents(null);
    setClearError(null);
  }

  async function clearTimers() {
    if (!clearEvents) return;
    const error = await performAction({
      type: "clear",
      expectedEvents: clearEvents,
    });
    if (error) setClearError(error);
    else closeClearDialog(true);
  }

  const displayedError = actionError ?? history.error;
  const hydrated = history.initialized;

  useEffect(() => {
    if (state === "stopped") return;
    let timeout: number;
    function tick() {
      setNow(Date.now());
      timeout = window.setTimeout(tick, 1001 - (Date.now() % 1000));
    }
    timeout = window.setTimeout(tick, 1001 - (Date.now() % 1000));
    return () => window.clearTimeout(timeout);
  }, [state]);

  const completedTotals = useMemo(
    () => calculateTotals(events, events.at(-1)?.at ?? 0),
    [events],
  );
  const currentMs =
    state === "stopped"
      ? 0
      : Math.max(
          0,
          Math.floor(now / 1000) -
            Math.floor((events.at(-1)?.at ?? now) / 1000),
        ) * 1000;
  const totals = {
    workMs: completedTotals.workMs + (state === "work" ? currentMs : 0),
    breakMs: completedTotals.breakMs + (state === "break" ? currentMs : 0),
    currentMs,
  };

  async function performAction(action: TimerAction): Promise<string | null> {
    setPending(true);
    try {
      await dispatchTimer(action);
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

  function startWork() {
    return transition("work");
  }

  function startBreak() {
    return transition("break");
  }

  function toggleMode() {
    return transition(state === "work" ? "break" : "work");
  }

  function stopTimer() {
    return transition("stopped");
  }

  function changeTimestamp(
    eventId: string,
    timestamp: number,
  ): Promise<string | null> {
    return performAction({ type: "edit", eventId, at: timestamp });
  }

  const currentLabel =
    state === "break"
      ? "Break Session"
      : state === "work"
        ? "Work Session"
        : "Total time";
  const prominentMs =
    state === "stopped" ? totals.workMs + totals.breakMs : totals.currentMs;

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl p-[clamp(12px,3vw,24px)]">
      <header className="mb-3">
        <h1 className="text-xs font-semibold text-slate-500">Work Timer</h1>
      </header>

      <section
        ref={timerSurfaceRef}
        tabIndex={-1}
        aria-label="Timer"
        className="rounded-3xl border border-slate-200 bg-white/85 p-[clamp(12px,3vw,24px)] shadow-xl shadow-slate-200/50 backdrop-blur"
      >
        <MetricCard
          label={currentLabel}
          prominent
          value={formatDuration(prominentMs)}
          active={state !== "stopped"}
          tone={state === "break" ? "break" : "work"}
        />

        <div className="totals-grid">
          <button
            type="button"
            className="min-w-0 rounded-2xl text-left enabled:cursor-pointer disabled:cursor-default"
            aria-label={`Work Total: ${durationLabel(formatDuration(totals.workMs))}. ${state === "work" ? "Currently working" : "Start work"}`}
            disabled={!hydrated || pending || state === "work"}
            onClick={() => transition("work")}
          >
            <MetricCard
              label="Work Total"
              value={formatDuration(totals.workMs)}
              active={state === "work"}
              tone="work"
            />
          </button>
          <button
            type="button"
            className="min-w-0 rounded-2xl text-left enabled:cursor-pointer disabled:cursor-default"
            aria-label={`Break Total: ${durationLabel(formatDuration(totals.breakMs))}. ${state === "break" ? "Currently on break" : "Start break"}`}
            disabled={!hydrated || pending || state === "break"}
            onClick={() => transition("break")}
          >
            <MetricCard
              label="Break Total"
              value={formatDuration(totals.breakMs)}
              active={state === "break"}
              tone="break"
            />
          </button>
        </div>

        <div
          className={`timer-actions ${state === "stopped" ? "start-actions" : "running-actions"}`}
        >
          {state === "stopped" ? (
            <>
              <Button
                ref={startWorkRef}
                variant="primary"
                className="min-w-0"
                onClick={startWork}
                disabled={!hydrated || pending}
              >
                Start Work
              </Button>
              <Button
                variant="break"
                className="min-w-0"
                onClick={startBreak}
                disabled={!hydrated || pending}
              >
                Start Break
              </Button>
            </>
          ) : (
            <>
              <Button
                variant={state === "work" ? "break" : "primary"}
                className="mode-action min-w-0 flex-1"
                onClick={toggleMode}
                disabled={pending}
              >
                {state === "work" ? "Switch to Break" : "Back to Work"}
              </Button>
              <Button
                variant="danger"
                className="stop-action whitespace-nowrap"
                onClick={stopTimer}
                disabled={pending}
              >
                Stop
              </Button>
            </>
          )}
        </div>

        {state === "stopped" && events.length > 0 ? (
          <div className="mt-2 flex justify-end">
            <Button
              ref={clearTriggerRef}
              variant="ghost"
              aria-haspopup="dialog"
              disabled={!hydrated || pending}
              onClick={() => {
                setClearEvents([...events]);
                setClearError(null);
              }}
            >
              Clear timers
            </Button>
          </div>
        ) : null}

        {displayedError ? (
          <p role="alert" className="mt-2 text-sm font-medium text-red-600">
            {displayedError}
          </p>
        ) : null}
      </section>

      <dialog
        ref={clearDialogRef}
        className="session-dialog"
        aria-labelledby="clear-dialog-title"
        aria-describedby="clear-dialog-description"
        onClose={() => {
          if (clearDialogOpenRef.current) closeClearDialog();
        }}
        onCancel={(event) => {
          event.preventDefault();
          if (!pending) closeClearDialog();
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget || pending) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            closeClearDialog();
        }}
      >
        <div className="flex flex-col gap-4">
          <h2 id="clear-dialog-title" className="text-lg font-semibold">
            Clear all timers?
          </h2>
          <p id="clear-dialog-description" className="text-sm text-slate-600">
            This deletes all session history and resets Work and Break totals to
            zero. This cannot be undone.
          </p>
          {clearError ? (
            <p role="alert" className="text-sm font-medium text-red-700">
              {clearError}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              ref={cancelClearRef}
              variant="secondary"
              disabled={pending}
              onClick={() => closeClearDialog()}
            >
              Cancel
            </Button>
            <Button variant="danger" disabled={pending} onClick={clearTimers}>
              Clear timers
            </Button>
          </div>
        </div>
      </dialog>

      <div className="mt-4">
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
