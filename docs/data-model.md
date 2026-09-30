# Data model

## Decision

Use **explicit state-transition events as canonical data** and derive interval rows from them.

Do not store generic toggle events. A record says which state began at a timestamp.

Example:

    09:02 -> work
    10:11 -> break
    10:23 -> work
    12:06 -> break
    12:41 -> work
    17:18 -> stopped

Derived intervals:

| Mode  | Started | Ended |
| ----- | ------- | ----- |
| Work  | 09:02   | 10:11 |
| Break | 10:11   | 10:23 |
| Work  | 10:23   | 12:06 |
| Break | 12:06   | 12:41 |
| Work  | 12:41   | 17:18 |

For event i:

    segment.start = event[i].at
    segment.end = event[i + 1].at
    segment.mode = event[i].state

If the final event is work or break, its end is null (displayed as a dash); its elapsed duration uses the current timestamp. If the final event is stopped, there is no active interval.

## Why not canonical start/end rows?

A canonical row model duplicates each shared boundary:

    Work  09:02 -> 10:11
    Break 10:11 -> 10:23

The 10:11 timestamp then exists in two records and introduces the invariant:

    row[n].end === row[n + 1].start

Transition events store that boundary once. Interval rows are still the right presentation model; they are simply derived.

## TypeScript model

    export type TimerState = "work" | "break" | "stopped";

    export interface TimerEvent {
      id: string;
      at: number; // epoch milliseconds
      state: TimerState;
    }

The local MVP exposes one continuous ordered event stream. IndexedDB persists each transition event individually. There is no calendar-date key, day grouping, or automatic filtering/resetting.

Stopping ends accumulation without erasing history. Starting again appends a work or break event, even on a later date. An active session can span midnight. Totals include every retained session; stopped gaps do not accumulate.

## Invariants

- Events are strictly chronological.
- The first event may be work or break.
- After stopped, the next state may be work or break.
- Work may transition only to break or stopped.
- Break may transition only to work or stopped.
- Consecutive duplicate states are invalid.
- A timestamp edit may not cross its neighboring event timestamps.

## Derived values

Work Total:

    sum(duration of every work segment)

Break Total:

    sum(duration of every break segment)

Work Session / Break Session:

    whole-second now - whole-second timestamp of the final event

only when the final event is work or break.

## Editing

The history table displays newest sessions first. Editing Started modifies the timestamp of the row's source transition event. Editing Ended modifies the following transition event, which also changes the next session's start when they are adjacent. An active session has no end timestamp to edit.

For adjacent work/break segments, this changes both:

- the previous segment's Ended value
- the edited segment's Started value

No balancing operation is required.

The UI should offer common relative corrections (-5, -1, +1, +5 minutes) and an exact date/time field.

## Persistence path

### MVP

Browser IndexedDB:

- one `events` object store persists each explicit transition event by ID
- each timer action, boundary edit, or explicit clear reads the latest events, validates the explicit action, and writes the resulting change in one `readwrite` transaction
- BroadcastChannel notifications make other tabs reread IndexedDB; correctness does not depend on receiving a notification

Benefits:

- no credentials
- no backend
- instant local startup
- atomic cross-tab mutations for a personal single-device tool

Explicit clearing requires stopped, unchanged history and runs atomically in the same transaction.

Tradeoff: clearing site data removes history and there is no device sync.

### Future Convex model

Only add this when cloud persistence or accounts are required.

Potential table:

    timerEvents
      ownerId
      at
      state
      createdAt
      updatedAt

The backend must validate transition rules and timestamp ordering. Authorization must ensure a user can only mutate their own events.

If multi-device edits are introduced, define conflict behavior before implementation rather than relying on last-write-wins accidentally.

Elapsed durations are calculated by truncating each boundary and the current time to whole seconds before subtraction. Totals sum these whole-second intervals so the current session and its mode total tick together. Event timestamps retain precise ordering for rapid transitions.
