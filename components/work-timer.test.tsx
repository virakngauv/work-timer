import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockedStore = vi.hoisted(() => ({
  snapshot: {
    initialized: false,
    events: [] as Array<{
      id: string;
      at: number;
      state: "work" | "break" | "stopped";
    }>,
    error: null as string | null,
  },
  nextError: null as string | null,
}));

vi.mock("@/lib/timer-store", () => ({
  useTimer: () => mockedStore.snapshot,
  dispatchTimer: vi.fn(
    async (
      action:
        | {
            type: "transition";
            from: "work" | "break" | "stopped";
            state: "work" | "break" | "stopped";
          }
        | { type: "edit"; eventId: string; at: number },
    ) => {
      if (mockedStore.nextError) throw new Error(mockedStore.nextError);

      if (action.type === "transition") {
        const current = mockedStore.snapshot.events.at(-1)?.state ?? "stopped";
        if (current !== action.state) {
          mockedStore.snapshot = {
            ...mockedStore.snapshot,
            events: [
              ...mockedStore.snapshot.events,
              {
                id: `event-${mockedStore.snapshot.events.length + 1}`,
                at: Date.now(),
                state: action.state,
              },
            ],
          };
        }
        return;
      }

      mockedStore.snapshot = {
        ...mockedStore.snapshot,
        events: mockedStore.snapshot.events.map((event) =>
          event.id === action.eventId ? { ...event, at: action.at } : event,
        ),
      };
    },
  ),
}));

import { WorkTimer } from "@/components/work-timer";
import { dispatchTimer } from "@/lib/timer-store";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("WorkTimer", () => {
  beforeEach(() => {
    mockedStore.snapshot = {
      initialized: true,
      events: [],
      error: null,
    };
    mockedStore.nextError = null;
  });

  it("starts in stopped mode and switches work to break with one action", async () => {
    const user = userEvent.setup();
    render(<WorkTimer />);

    expect(screen.getByText("Total time")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Start Work" }));
    expect(screen.getByText("Work Session")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Switch to Break" }));

    expect(screen.getByText("Break Session")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Back to Work" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Work/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Break/).length).toBeGreaterThan(0);
  });

  it("shows combined accumulated time when stopped and the current session when running", () => {
    mockedStore.snapshot.events = [
      { id: "work", at: 0, state: "work" },
      { id: "break", at: 60_000, state: "break" },
      { id: "stop", at: 90_000, state: "stopped" },
    ];
    const { rerender } = render(<WorkTimer />);
    expect(screen.getByRole("timer")).toHaveAccessibleName(
      "Total time: 0 hours, 1 minutes, 30 seconds",
    );
    mockedStore.snapshot.events.push({
      id: "resume",
      at: Date.now(),
      state: "work",
    });
    rerender(<WorkTimer />);
    expect(screen.getByRole("timer")).toHaveAccessibleName(
      "Work Session: 0 hours, 0 minutes, 0 seconds",
    );
  });

  it("switches the main timer by click, Enter, and Space", async () => {
    const user = userEvent.setup();
    render(<WorkTimer />);
    expect(screen.getByRole("button", { name: "Total time" })).toBeDisabled();
    expect(screen.queryByText("⇄")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start Work" }));
    const timer = screen.getByRole("button", { name: "Switch timer to break" });
    expect(timer).not.toContainElement(screen.getByRole("timer"));
    expect(screen.getByText("⇄")).toHaveAttribute("aria-hidden", "true");
    await user.click(timer);
    expect(timer).toHaveAccessibleName("Switch timer to work");
    timer.focus();
    await user.keyboard("{Enter}");
    expect(timer).toHaveAccessibleName("Switch timer to break");
    await user.keyboard(" ");
    expect(mockedStore.snapshot.events.map((event) => event.state)).toEqual([
      "work",
      "break",
      "work",
      "break",
    ]);
    await user.click(screen.getByRole("button", { name: "Stop" }));
    expect(timer).toBeDisabled();
    expect(screen.queryByText("⇄")).not.toBeInTheDocument();
  });

  it("disables the main timer while a transition is pending", async () => {
    const user = userEvent.setup();
    mockedStore.snapshot.events = [
      { id: "work", at: Date.now(), state: "work" },
    ];
    let complete!: () => void;
    vi.mocked(dispatchTimer).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    render(<WorkTimer />);
    const timer = screen.getByRole("button", { name: "Switch timer to break" });
    await user.click(timer);
    expect(timer).toBeDisabled();
    expect(screen.getByText("⇄")).toBeVisible();
    await act(async () => complete());
    expect(timer).toBeEnabled();
  });

  it("preserves tenths in the stopped total without further accumulation", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    mockedStore.snapshot.events = [
      { id: "work", at: 150, state: "work" },
      { id: "break", at: 1850, state: "break" },
      { id: "stop", at: 2450, state: "stopped" },
    ];
    render(<WorkTimer />);
    const total = screen.getByRole("timer");
    expect(total).toHaveTextContent("00:00:02.3");
    expect(total).toHaveAccessibleName(
      "Total time: 0 hours, 0 minutes, 2.3 seconds",
    );
    expect(
      screen.getByRole("button", { name: /^Work Total/ }),
    ).toHaveTextContent("00:00:01.7");
    expect(
      screen.getByRole("button", { name: /^Break Total/ }),
    ).toHaveTextContent("00:00:00.6");
    act(() => vi.advanceTimersByTime(5000));
    expect(total).toHaveTextContent("00:00:02.3");
  });

  it.each(["work", "break"] as const)(
    "updates the %s counters every tenth without adding decimals to the table",
    (state) => {
      vi.useFakeTimers();
      vi.setSystemTime(2350);
      mockedStore.snapshot.events = [
        { id: "first", at: 150, state },
        { id: "other", at: 1850, state: state === "work" ? "break" : "work" },
        { id: "current", at: 2350, state },
      ];
      render(<WorkTimer />);
      const current = screen.getByRole("timer");
      const total = screen.getByRole("button", {
        name: state === "work" ? /^Work Total/ : /^Break Total/,
      });
      expect(current).toHaveTextContent("00:00:00.0");
      expect(total).toHaveTextContent("00:00:01.7");
      act(() => vi.advanceTimersByTime(51));
      expect(current).toHaveTextContent("00:00:00.1");
      expect(current).toHaveAccessibleName(
        `${state === "work" ? "Work" : "Break"} Session: 0 hours, 0 minutes, 0.1 seconds`,
      );
      expect(total).toHaveTextContent("00:00:01.8");
      expect(screen.getByRole("table")).not.toHaveTextContent(
        /\d{2}:\d{2}\.\d/,
      );
      act(() => vi.advanceTimersByTime(100));
      expect(current).toHaveTextContent("00:00:00.2");
      expect(total).toHaveTextContent("00:00:01.9");
    },
  );

  it("switches modes through the totals without restarting the active mode", async () => {
    const user = userEvent.setup();
    render(<WorkTimer />);

    const workTotal = screen.getByRole("button", { name: /^Work Total/ });
    const breakTotal = screen.getByRole("button", { name: /^Break Total/ });
    expect(breakTotal).toBeEnabled();

    await user.click(workTotal);
    expect(screen.getByText("Work Session")).toBeInTheDocument();
    expect(workTotal).toBeDisabled();
    await user.click(workTotal);
    expect(mockedStore.snapshot.events).toHaveLength(1);

    await user.click(breakTotal);
    expect(screen.getByText("Break Session")).toBeInTheDocument();
    expect(breakTotal).toBeDisabled();

    await user.click(workTotal);
    expect(screen.getByText("Work Session")).toBeInTheDocument();
    expect(mockedStore.snapshot.events.map((event) => event.state)).toEqual([
      "work",
      "break",
      "work",
    ]);
  });

  it("renders store initialization errors and keeps actions disabled", () => {
    mockedStore.snapshot = {
      initialized: false,
      events: [],
      error: "Could not read timer storage.",
    };

    render(<WorkTimer />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not read timer storage.",
    );
    expect(screen.getByRole("button", { name: "Start Work" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Start Break" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Work Total/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Break Total/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Total time" })).toBeDisabled();
  });

  it("surfaces a failed action without changing the visible mode", async () => {
    const user = userEvent.setup();
    mockedStore.nextError =
      "Could not save timer data. The change was not applied.";

    render(<WorkTimer />);
    await user.click(screen.getByRole("button", { name: "Start Work" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not save timer data. The change was not applied.",
    );
    expect(screen.getByText("Total time")).toBeInTheDocument();
  });
});
