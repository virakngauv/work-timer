import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkTimer } from "@/components/work-timer";

describe("WorkTimer", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts in stopped mode and switches work to break with one action", async () => {
    const user = userEvent.setup();
    render(<WorkTimer />);

    expect(await screen.findByText("STOPPED")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Start Day" }));
    expect(screen.getByText("WORK MODE")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Switch to Break" }),
    );

    expect(screen.getByText("BREAK MODE")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to Work" })).toBeInTheDocument();
    expect(screen.getAllByText(/Work/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Break/).length).toBeGreaterThan(0);
  });
});
