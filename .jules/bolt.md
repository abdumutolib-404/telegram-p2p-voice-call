## 2026-10-12 - Fixed-size Slice Sorting and Key Formatting in Matchmaking
**Learning:** `sort.SliceStable` on small fixed slices in Go incurs heap allocations and interface reflection overhead. Generating dynamic string keys repeatedly in cancellation loops adds unnecessary GC pressure.
**Action:** Use fixed stack arrays with in-place insertion sort for small fixed-size collections, and package-level static slice constants for deterministic key formatting.
