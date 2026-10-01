import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionTable } from "@/components/session-table";
import { fromLocalDateTimeInput, type TimerState } from "@/lib/timer";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(cleanup);

describe("session time editing", () => {
  it.each(["break", "stopped"] as TimerState[])(
    "edits the work end by updating its following %s transition",
    async (nextState) => {
      const user = userEvent.setup();
      const start = new Date(2026, 0, 15, 12, 0, 17).getTime();
      const events = [
        { id: "work", state: "work" as const, at: start },
        { id: "next", state: nextState, at: start + 20 * 60_000 },
      ];
      const onChangeTimestamp = vi.fn().mockResolvedValue(null);
      render(
        <SessionTable
          events={events}
          now={start + 30 * 60_000}
          onChangeTimestamp={onChangeTimestamp}
          pending={false}
        />,
      );

      await user.click(
        screen.getByRole("button", { name: /^Edit work session/ }),
      );
      await user.click(screen.getByRole("button", { name: "End" }));
      const input = screen.getByLabelText("Exact end time");
      expect(fromLocalDateTimeInput((input as HTMLInputElement).value)).toBe(
        events[1].at,
      );
      await user.click(screen.getByRole("button", { name: "-5 min" }));
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(onChangeTimestamp).toHaveBeenCalledWith(
        "next",
        start + 15 * 60_000,
      );
      expect(events[0].at).toBe(start);
      expect(screen.queryByLabelText("Exact end time")).not.toBeInTheDocument();
    },
  );
  it.each([
    ["2026-01-15T12:30", "future"],
    ["2026-01-15T12:20", "before the next boundary"],
  ])("rejects invalid start %s before saving", async (value, message) => {
    const user = userEvent.setup();
    const start = new Date(2026, 0, 15, 12).getTime();
    const onChangeTimestamp = vi.fn();
    render(
      <SessionTable
        events={[
          { id: "work", state: "work", at: start },
          { id: "stop", state: "stopped", at: start + 20 * 60_000 },
        ]}
        now={start + 25 * 60_000}
        onChangeTimestamp={onChangeTimestamp}
        pending={false}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /^Edit work session/ }),
    );
    const input = screen.getByLabelText("Exact start time");
    // Native date/time controls do not support userEvent.type in jsdom.
    fireEvent.change(input, { target: { value } });
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(onChangeTimestamp).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeVisible();
  });

  it("leaves the end unavailable for a running session and returns focus on cancel", async () => {
    const user = userEvent.setup();
    const start = new Date(2026, 0, 15, 12).getTime();
    render(
      <SessionTable
        events={[{ id: "work", state: "work", at: start }]}
        now={start + 60_000}
        onChangeTimestamp={vi.fn()}
        pending={false}
      />,
    );
    const trigger = screen.getByRole("button", { name: /^Edit work session/ });
    await user.click(trigger);
    expect(screen.getByRole("button", { name: "End" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("separates repeated modes with stopped events in reverse chronological order", () => {
    const start = new Date(2026, 0, 15, 12).getTime();
    const events = [
      { id: "first", state: "break" as const, at: start },
      { id: "stop", state: "stopped" as const, at: start + 10 * 60_000 },
      { id: "second", state: "break" as const, at: start + 20 * 60_000 },
    ];
    const { rerender } = render(
      <SessionTable
        events={events}
        now={start + 30 * 60_000}
        onChangeTimestamp={vi.fn()}
        pending={false}
      />,
    );
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows).toHaveLength(4);
    expect(rows[1]).toHaveTextContent("Break");
    expect(rows[2]).toHaveTextContent("Timer stopped");
    expect(rows[3]).toHaveTextContent("Break");
    expect(within(rows[2]).queryByRole("button")).not.toBeInTheDocument();
    expect(rows[2].querySelector("time")).toHaveAttribute(
      "datetime",
      new Date(events[1].at).toISOString(),
    );
    rerender(
      <SessionTable
        events={events.slice(0, 2)}
        now={start + 30 * 60_000}
        onChangeTimestamp={vi.fn()}
        pending={false}
      />,
    );
    expect(
      within(screen.getByRole("table")).getAllByRole("row")[1],
    ).toHaveTextContent("Timer stopped");
  });
  it("gives same-mode edit buttons distinct session context even within one second", () => {
    const start = new Date(2026, 0, 15, 12).getTime();
    render(
      <SessionTable
        events={[
          { id: "work1", state: "work", at: start },
          { id: "break", state: "break", at: start + 100 },
          { id: "work2", state: "work", at: start + 200 },
        ]}
        now={start + 60_000}
        onChangeTimestamp={vi.fn()}
        pending={false}
      />,
    );
    const buttons = screen.getAllByRole("button", {
      name: /^Edit work session/,
    });
    const names = buttons.map((button) => button.getAttribute("aria-label"));
    expect(new Set(names).size).toBe(2);
    expect(buttons[0]).toHaveAccessibleName(
      `Edit work session 3, started ${new Date(start + 200).toLocaleString()}`,
    );
    expect(buttons[1]).toHaveAccessibleName(
      `Edit work session 1, started ${new Date(start).toLocaleString()}`,
    );
  });
});
