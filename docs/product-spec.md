# Product specification

## Problem

The current manual workflow uses separate work, break, and current-lap timers. Starting work means starting both the total work timer and the current session timer. Switching to a break requires stopping/resetting the current lap and changing which total timer is running. The process creates avoidable clicks and makes it easy to forget a step.

The goal is to keep the useful glanceable information while reducing the control surface to one mode toggle and one stop action.

## Product principles

1. **Awareness, not interruption.** The timer never decides that a session is over.
2. **One action to change modes.** Work <-> Break should be a single click.
3. **The current session resets automatically.** Every work/break transition starts a fresh session timer.
4. **Corrections are normal.** Forgetting to switch modes should be easy to repair without manually rebalancing totals.
5. **History remains understandable.** Users see session rows, not implementation-level event records.

## Main states

### Stopped

Nothing accumulates.

Primary action: **Start Day**

Starting creates a `work` event at the current timestamp.

### Work mode

Visible:

- Today's Work total
- Current Session
- Break Today total
- **Switch to Break**
- **Stop Day**

Switch to Break creates a `break` event at the current timestamp.

### Break mode

Visible:

- Today's Work total
- Current Break
- Break Today total
- **Back to Work**
- **Stop Day**

Back to Work creates a `work` event at the current timestamp.

### Stop Day

Stop Day creates a `stopped` event. No timer continues after it.

The same workday may be resumed later by creating a new `work` event.

## Correction scenario

Example:

- 10:00 -> break
- user actually returns to work at 10:20
- user notices at 10:25 and clicks Back to Work
- recorded event is initially 10:25 -> work

The history initially displays:

| Mode  | Started | Ended | Duration |
| ----- | ------- | ----- | -------- |
| Break | 10:00   | 10:25 | 25m      |
| Work  | 10:25   | Now   | ...      |

The user edits the Work start boundary from 10:25 to 10:20.

The result becomes:

| Mode  | Started | Ended | Duration |
| ----- | ------- | ----- | -------- |
| Break | 10:00   | 10:20 | 20m      |
| Work  | 10:20   | Now   | ...      |

Only one underlying timestamp changes. The totals recompute automatically.

## Non-goals for the MVP

- Pomodoro intervals or alarms
- Team time tracking
- Billing/invoicing
- Project/task categorization
- Cloud sync
- Accounts
- Analytics
- Notifications

These can be reconsidered only if a concrete need appears.
