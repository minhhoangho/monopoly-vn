---
paths:
  - "packages/engine/**"
---

# Engine rules

- Pure functions only: `(state, action, rng) -> newState`. No I/O, timers, Date.now(), or Math.random().
- Every rule in docs/requirements.md §4 has a test named with its ID, e.g. `it("R12: houses must be built evenly")`.
- Invalid actions return a typed error, never throw for expected cases.
- State must stay JSON-serializable (no classes, Maps, or functions in state).
