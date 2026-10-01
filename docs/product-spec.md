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

Actions: **Start Work** and **Start Break**, or the corresponding total card.

Starting creates a `work` or `break` event at the current timestamp.

### Work mode

Visible:

- Work Total
- Work Session
- Break Total
- **Switch to Break**
- **Stop**

Switch to Break creates a `break` event at the current timestamp.

### Break mode

Visible:

- Work Total
- Break Session
- Break Total
- **Back to Work**
- **Stop**

Back to Work creates a `work` event at the current timestamp.

### Stop

Stop creates a `stopped` event. No timer continues after it. History displays a timestamped stop separator. Clear timers is available while stopped and removes all history and totals only after explicit warning confirmation.

Work or break can be resumed at any later time by appending the corresponding event. History and totals persist across dates without automatic filtering or resets.

## Correction scenario

Example:

- 10:00 -> break
- user actually returns to work at 10:20
- user notices at 10:25 and clicks Back to Work
- recorded event is initially 10:25 -> work

The history initially displays:

| Mode  | Start / End   | Duration |
| ----- | ------------- | -------- |
| Work  | 10:25 –       | ...      |
| Break | 10:00 – 10:25 | 25:00    |

The user edits the Work start boundary from 10:25 to 10:20.

The result becomes:

| Mode  | Start / End   | Duration |
| ----- | ------------- | -------- |
| Work  | 10:20 –       | ...      |
| Break | 10:00 – 10:20 | 20:00    |

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
