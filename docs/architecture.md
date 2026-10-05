# Architecture

A tour of how HephCAD is put together, written for someone about to make their first change. The design decisions behind it live in [docs/adr](adr/); this page is about how the pieces fit at runtime.

## The four layers

```
┌───────────────────────────────────────────────────────────────┐
│ React UI          src/ui/          panels, toolbars, context bar │
│   reads/writes ─► Zustand store    src/state/appStore.ts        │
├───────────────────────────────────────────────────────────────┤
│ App actions       src/app/         thin glue: "user tapped X"    │
│ Document          src/doc/         journal, undo/redo, autosave  │
├───────────────────────────────────────────────────────────────┤
│ Viewport          src/viewport/    Three.js scene, gestures,     │
│                                    picking, sketch & drag tools  │
│ Sketch math       src/sketch/      pure 2D geometry + snapping   │
├───────────────────────────────────────────────────────────────┤
│ Kernel worker     src/kernel/      OpenCascade (WASM) — the only │
│                                    code that ever touches OCCT   │
└───────────────────────────────────────────────────────────────┘
```

Three rules hold the layers apart, and most bugs we've fixed came from bending one of them:

1. **OCCT lives only in the Web Worker** ([worker.ts](../src/kernel/worker.ts)). The main thread talks to it through [KernelClient](../src/kernel/KernelClient.ts) with a typed request/response [protocol](../src/kernel/protocol.ts). Geometry comes back as `TypedArray`s moved with zero-copy transferables. This keeps the UI at full frame rate and lets us restart a crashed kernel without losing the page.
2. **React never enters the render loop** ([ADR 0004](adr/0004-viewport-react-boundary.md)). The [Viewport](../src/viewport/Viewport.ts) is a plain class that owns the renderer, camera, and every drag interaction. React only draws 2D panels. The two sides meet in the Zustand store: the viewport subscribes to selection/visibility/tool mode, and UI subscribes to whatever it displays.
3. **Every geometry change is a `JournalOp`**. Nothing creates, edits, or deletes a body except by sending an op through the [DocumentController](../src/doc/DocumentController.ts).

## The journal: one code path for live edits, undo, and file open

[journal.ts](../src/doc/journal.ts) defines `JournalOp`, a union of every modeling operation (`createBox`, `extrude`, `fillet`, `shell`, `importStep`, …). The worker has exactly one executor, `applyJournalOp`, and it is used for:

| When | What happens |
|---|---|
| User finishes a drag | `DocumentController.apply(op)` → worker runs it → the op (with ids filled in) is appended to the journal |
| Redo | the next recorded op is run again |
| Undo / open file | `replayJournal(ops)`: the worker resets and runs ops `0..cursor` from scratch |
| Kernel crash | `KernelClient` restarts the worker, then `DocumentController.recover()` replays |

Because all four go through the same function, a replayed model can't drift from the one the user built. Two invariants make that work:

- **Body ids are recorded in the op.** The first time an op runs, the kernel assigns a `bodyId` and writes it back into the op before it's journaled. On replay the op asks for that exact id. Later ops reference bodies by id (`hostBodyId`, `bodyId`), so those references stay valid forever. See `claimBodyId` in the worker.
- **Ops are self-contained.** An `extrude` op carries its sketch plane, every curve, and which closed region to use — not a pointer to some transient sketch object. Replay rebuilds the region from the curves.

Replay is fault tolerant: if an op throws (OCCT can be finicky), it is skipped, the rest of the document still loads, and the history panel flags it. Only a fatal WASM abort stops a replay — and that triggers a worker restart.

Face and edge ids inside a body (`topoId`) are **not** stable across operations — a boolean or fillet renumbers them. That's acceptable because ops that use them (`fillet`, `shell`) record the ids that were valid at that point in the journal, and replay reaches the same state before running them. See [ADR 0002](adr/0002-topology-id-mapping.md).

## Life of a drag-extrude

The signature interaction touches every layer, so it's a good map of the code:

1. **Sketch.** `enterSketchMode` ([sketchActions.ts](../src/app/sketchActions.ts)) asks the kernel for the selected face's plane, then `Viewport.enterSketch` creates a [SketchSession](../src/viewport/SketchSession.ts) and switches gestures to draw mode.
2. **Draw.** Each pointer event is ray-cast onto the sketch plane, converted to plane `(u, v)` coordinates, snapped ([snapping.ts](../src/sketch/snapping.ts)), and fed to a tool state machine ([tools.ts](../src/sketch/tools.ts)). Committed curves trigger a `sketchRegions` request; the worker finds closed regions with OCCT's planar-graph analysis and returns their meshes for the blue fill.
3. **Done.** `SketchSession.finish` waits for any in-flight region detection, then hands back a `CommittedSketch`: the curves plus one fill mesh per region.
4. **Drag.** A finger-down on a region starts an extrude drag. The preview is a pure-JS ghost prism ([ExtrudePreview.ts](../src/viewport/ExtrudePreview.ts)) — no kernel round-trips while dragging. Screen motion maps to height by projecting the plane normal onto the screen ([extrudeMath.ts](../src/viewport/extrudeMath.ts)).
5. **Release.** The viewport builds an `extrude` op and hands it to `DocumentController.apply`. The worker rebuilds the region from the curves, sweeps a prism, and fuses (pull) or cuts (push) it against the host body. The controller swaps in the new mesh, updates the store, journals the op, and schedules an autosave.

Fillet, chamfer, and shell drags work the same way, except the preview has to come from the kernel: `previewOp` computes a result mesh without changing kernel state, throttled so only one request is in flight at a time.

## Recipe: adding a new modeling operation

Say you want to add **revolve**. You'll touch these files, roughly in order:

1. **[journal.ts](../src/doc/journal.ts)** — add a `{ kind: 'revolve', ... }` variant with everything replay needs (axis, angle, curves, and a `bodyId` the kernel can fill in). Add its history label in `opLabel` and, if it creates a body, its name in `aliveBodyNames` (TypeScript flags a missing `opLabel` case, but not a missing `aliveBodyNames` one — don't skip it).
2. **[worker.ts](../src/kernel/worker.ts)** — add a `case 'revolve'` to `applyJournalOp`. Use `claimBodyId` for new bodies, free every OCCT object you create (`.delete()`), and throw a plain `Error` with a user-readable message when OCCT says no.
3. **A test** — pure logic (labels, names, math) gets a Vitest unit test next to the source. OCCT code can't run under Vitest; verify it in the browser (see below).
4. **UI** — an action in [src/app](../src/app/) that calls `documentController.apply(...)`, and a button in the toolbar or [ContextBar](../src/ui/ContextBar.tsx). If it's a drag, add the drag state to `Viewport` alongside the existing move/param drags and route it from `handleGrabStart`.

That's it — undo, redo, autosave, crash recovery, and history display come for free.

## Debugging

In `npm run dev` builds, a few globals are exposed in the browser console:

| Global | What it is |
|---|---|
| `__heph.kernel` | the `KernelClient` — call any kernel op directly, e.g. `await __heph.kernel.measure([...])` |
| `__heph.viewport` | the `Viewport` — scene, camera rig, `captureImage()` |
| `__hephDoc` | the `DocumentController` — `apply`, `undo`, `redo` |
| `__hephStore` | the Zustand store — `__hephStore.getState()` |

Use `__hephStore` rather than `import('/src/state/appStore.ts')` from the console: after a hot reload, a dynamic import can resolve to a *different* module instance than the running app.

Worker `console.log` output does not always show up in tooling that captures page logs. When debugging kernel code, return diagnostics in the response instead (see the `debug` field on `SketchRegionsResult`).

## OpenCascade.js gotchas

These cost us real time; they're documented in the code where they occur:

- **Handle upcasts don't happen automatically.** Embind won't pass a `Handle_Geom_TrimmedCurve` where a `Handle_Geom_Curve` is expected. Re-wrap the raw pointer: `new oc.Handle_Geom_Curve_2(trimmed.get())` (see `trimmedCurveToEdge` in [sketchRegions.ts](../src/kernel/sketchRegions.ts)).
- **Enum members are typed as `{}`** in the generated `.d.ts`. Assert them: `oc.TopAbs_ShapeEnum.TopAbs_FACE as TopAbs_ShapeEnum`.
- **Overloads are numbered** (`MakeBox_2`, `Add_2`, `Transformed`…). Look up the exact signature in `node_modules/opencascade.js/dist/opencascade.full.d.ts` before guessing.
- **Every `new oc.X()` must be `.delete()`d**, including intermediate `gp_Pnt`/`gp_Vec`. Leaks are silent until an iPad runs out of WASM memory.
- **Some bindings differ between builds** — `BRep_Tool.Triangulation` is probed at runtime in [tessellate.ts](../src/kernel/tessellate.ts) for this reason.

## Testing

- `npm run test` runs Vitest on everything that doesn't need WebGL or WASM: camera math, gestures, picking, sketch geometry, snapping, tool state machines, the journal and document controller (with a fake kernel), and kernel crash recovery (with a fake worker).
- Kernel and rendering behavior is verified in a real browser. Drive the app through the console globals above, then check the store, the scene, or a screenshot.
- A browser tab that's hidden throttles `requestAnimationFrame` to about once per second, so camera animations barely progress. If an automated check depends on the camera settling, advance it manually: `while (__heph.viewport.rig.update(1/60)) {}`.
