# UI specification

## Main timer surface

The page should feel like a calm instrument panel rather than a productivity coach.

### Work mode

- Large Today’s Work total
- Current Session card
- Break Today card
- Green primary button: **Switch to Break**
- Red secondary button: **Stop Day**
- Work mode badge

### Break mode

- Today’s Work remains visible but inactive
- Current Break is visually active
- Break Today continues accumulating
- Primary button: **Back to Work**
- Red secondary button: **Stop Day**
- Break mode badge

### Stopped

- Totals remain visible
- No time accumulates
- Primary button: **Start Day**

## Today's Sessions table

Place the history underneath the timer cards.

Columns:

| Mode  | Started  | Ended    | Duration | Action |
| ----- | -------- | -------- | -------- | ------ |
| Work  | 9:02 AM  | 10:11 AM | 1h 09m   | Edit   |
| Break | 10:11 AM | 10:23 AM | 12m      | Edit   |
| Work  | 10:23 AM | Now      | 42m      | Edit   |

The Ended column is normally derived from the next row's start event. It should not behave like an independent field.

## Boundary editing

Selecting Edit expands an inline editor beneath that row.

Controls:

- -5 min
- -1 min
- +1 min
- +5 min
- exact local date/time input
- Save
- Cancel

Copy should explain the side effect when applicable:

> Changing this start time also changes the end of the previous session.

Save is disabled if the proposed timestamp would be equal to or cross a neighboring event.

## Optional fast correction

A future enhancement can show a temporary shortcut immediately after a mode switch:

- Started now
- Started 5 min ago
- Edit start time

This is useful for the common case where the user notices a forgotten switch a few minutes late.

## Accessibility

- Use semantic buttons and table markup.
- Give mode/status text in addition to color.
- Maintain visible focus states.
- Do not rely on green/red alone.
- Inline editing must be keyboard usable.
- Errors should explain the invalid boundary rather than silently clamping it.
