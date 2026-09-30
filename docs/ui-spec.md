# UI specification

## Main timer surface

Keep the current timer large at the top, Work Total and Break Total side by side below, and controls beneath them. Timer sizes adjust fluidly; long durations may wrap at colon boundaries to preserve readable text. The totals use less vertical padding than the current timer.

### Work mode

- Work Session and Work Total highlight green.
- Break Total remains neutral and can be clicked to start a break.
- Controls: **Switch to Break** and **Stop**.

### Break mode

- Break Session and Break Total highlight blue.
- Work Total remains neutral and can be clicked to return to work.
- Controls: **Back to Work** and **Stop**.

### Stopped

- Totals and history remain visible across calendar dates.
- No time accumulates.
- Both total cards can start their corresponding mode.
- **Start Work** and **Start Break** align with the total cards above.

## Sessions table

Place history below the timer cards without a separate title. Show newest events first. Display stopped events as subtle left-aligned “Timer stopped · 3:53 PM” separators spanning all three columns, without duration or edit controls.

| Mode  | Start / End      | Duration |
| ----- | ---------------- | -------- |
| Work  | 10:23 AM –       | 42:00    |
| Break | 10:11 – 10:23 AM | 12:00    |

Keep these three columns and visible headings at every width. Keep each row on one line, with a compact time range such as 3:40 – 3:53 PM in one color. Omit the first AM/PM only when both times share it. Balance the whitespace between the three columns; on narrow screens or enlarged text the history can scroll horizontally without shrinking text or stacking rows. Use MM:SS below one hour and HH:MM:SS from one hour onward. An active session shows its start and the range separator, with nothing after the dash.

## Session editing

The duration is a 44px-high button with one pencil that appears on hover or keyboard focus and remains visible on touch devices. Clicking opens a modal dialog with Start and End choices, an exact local date/time field, -5/-1/+1/+5 minute corrections, Save, and Cancel. A running session's End choice is disabled. The dialog traps focus; Escape and Cancel close it and return focus to the duration. If another tab clears the session, close its editor and return focus to history.

Explain shared-boundary changes in the editor. Reject invalid dates, future times, and timestamps crossing neighboring events. Validate again against the latest persisted history to handle edits from other tabs.

Stop preserves all history and can be followed immediately by a new work or break session. It needs no confirmation dialog. When stopped with saved history, show Clear timers. Its warning modal explains that all history is deleted and both totals reset; Cancel, Escape, and clicking outside dismiss without changes. Clearing requires explicit confirmation and rechecks that history is unchanged and stopped.

## Accessibility

- Use semantic buttons and table markup.
- Give mode text in addition to color.
- Maintain visible focus states and accessible names for pencil controls.
- Keep modal editing keyboard usable.
- Errors explain invalid timestamps rather than silently clamping them.
