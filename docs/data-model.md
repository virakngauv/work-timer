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

| Mode | Started | Ended |
| --- | --- | --- |
| Work | 09:02 | 10:11 |
| Break | 10:11 | 10:23 |
| Work | 10:23 | 12:06 |
| Break | 12:06 | 12:41 |
| Work | 12:41 | 17:18 |

For event i:

    segment.start = event[i].at
    segment.end = event[i + 1].at
    segment.mode = event[i].state

If the final event is work or break, its end is Now. If the final event is stopped, there is no active interval.

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

The local MVP stores one ordered event array plus a local-calendar `dateKey` identifying the workday.

## Workday rollover

- Starting on a date creates that date's workday.
- Stopping does not erase the day's history; the user can resume later the same day.
- If the stored workday is stopped and the calendar date has advanced, loading the app begins with a fresh empty day.
- If a session is still active across midnight, the active workday is preserved until the user stops it. A future cloud-backed version can add a more sophisticated rollover policy if needed.

## Invariants

- Events are strictly chronological.
- The first event must be work.
- After stopped, the only allowed next state is work.
- Work may transition only to break or stopped.
- Break may transition only to work or stopped.
- Consecutive duplicate states are invalid.
- A timestamp edit may not cross its neighboring event timestamps.

## Derived values

Today's Work:

    sum(duration of every work segment)

Break Today:

    sum(duration of every break segment)

Current Session / Current Break:

    now - timestamp of the final event

only when the final event is work or break.

## Editing

The History table displays interval rows, but editing Started modifies the timestamp of that row's source transition event.

For adjacent work/break segments, this changes both:

- the previous segment's Ended value
- the edited segment's Started value

No balancing operation is required.

The UI should offer common relative corrections (-5, -1, +1, +5 minutes) and an exact date/time field.

## Persistence path

### MVP

Browser localStorage:

    {
      "version": 1,
      "dateKey": "YYYY-MM-DD",
      "events": [...]
    }

Benefits:

- no credentials
- no backend
- instant local startup
- enough for a personal single-device tool

Tradeoff: clearing site data removes history and there is no device sync.

### Future Convex model

Only add this when cloud persistence or accounts are required.

Potential tables:

    workdays
      ownerId
      startedAt
      timezone
      createdAt

    timerEvents
      workdayId
      at
      state
      createdAt
      updatedAt

The backend must validate transition rules and timestamp ordering. Authorization must ensure a user can only mutate their own workdays/events.

If multi-device edits are introduced, define conflict behavior before implementation rather than relying on last-write-wins accidentally.
