import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkTimer } from "@/components/work-timer";
import { localDateKey, STORAGE_KEY } from "@/lib/storage";

function simulateExternalStorageChange(): void {
  window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
}

afterEach(cleanup);

describe("WorkTimer", () => {
  beforeEach(() => {
    window.localStorage.clear();
    simulateExternalStorageChange();
  });

  it("starts in stopped mode and switches work to break with one action", async () => {
    const user = userEvent.setup();
    render(<WorkTimer />);

    expect(await screen.findByText("STOPPED")).toBeInTheDocument();

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

  it("restores an in-progress day from localStorage", () => {
    const startedAt = Date.now() - 30 * 60_000;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        dateKey: localDateKey(startedAt),
        events: [{ id: "seed-event", at: startedAt, state: "work" }],
      }),
    );
    simulateExternalStorageChange();

    render(<WorkTimer />);

    expect(screen.getByText("WORK MODE")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Switch to Break" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Stop Day" }),
    ).toBeInTheDocument();
  });

  it("follows workday changes written by another tab", async () => {
    render(<WorkTimer />);

    expect(screen.getByText("STOPPED")).toBeInTheDocument();

    const startedAt = Date.now() - 10 * 60_000;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        dateKey: localDateKey(startedAt),
        events: [{ id: "other-tab-event", at: startedAt, state: "work" }],
      }),
    );
    simulateExternalStorageChange();

    expect(await screen.findByText("WORK MODE")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Switch to Break" }),
    ).toBeInTheDocument();
  });
});
