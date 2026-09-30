import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockedStore = vi.hoisted(() => ({
  snapshot: {
    dateKey: "",
    events: [] as Array<{
      id: string;
      at: number;
      state: "work" | "break" | "stopped";
    }>,
    error: null as string | null,
  },
  nextError: null as string | null,
}));

vi.mock("@/lib/workday-store", () => ({
  useWorkday: () => mockedStore.snapshot,
  dispatchWorkday: vi.fn(
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
import { localDateKey } from "@/lib/storage";

afterEach(cleanup);

describe("WorkTimer", () => {
  beforeEach(() => {
    mockedStore.snapshot = {
      dateKey: localDateKey(),
      events: [],
      error: null,
    };
    mockedStore.nextError = null;
  });

  it("starts in stopped mode and switches work to break with one action", async () => {
    const user = userEvent.setup();
    render(<WorkTimer />);

    expect(screen.getByText("STOPPED")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Start Day" }));
    expect(screen.getByText("WORK MODE")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Switch to Break" }));

    expect(screen.getByText("BREAK MODE")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Back to Work" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Work/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Break/).length).toBeGreaterThan(0);
  });

  it("renders store initialization errors and keeps actions disabled", () => {
    mockedStore.snapshot = {
      dateKey: "",
      events: [],
      error: "Existing timer data is unreadable.",
    };

    render(<WorkTimer />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Existing timer data is unreadable.",
    );
    expect(screen.getByRole("button", { name: "Start Day" })).toBeDisabled();
  });

  it("surfaces a failed action without changing the visible mode", async () => {
    const user = userEvent.setup();
    mockedStore.nextError =
      "Could not save timer data. The change was not applied.";

    render(<WorkTimer />);
    await user.click(screen.getByRole("button", { name: "Start Day" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not save timer data. The change was not applied.",
    );
    expect(screen.getByText("STOPPED")).toBeInTheDocument();
  });
});
