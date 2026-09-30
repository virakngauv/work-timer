import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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

afterEach(cleanup);

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

    expect(screen.getByText("Stopped")).toBeInTheDocument();

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
    expect(screen.getByText("Stopped")).toBeInTheDocument();
  });
});
