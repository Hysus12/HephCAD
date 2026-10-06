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
│ Viewport          src/viewport/    Three.js scene, input routing,│
│                                    drawing, handles, picking     │
│ Sketch math       src/sketch/      pure 2D geometry + snapping   │
├───────────────────────────────────────────────────────────────┤
│ Kernel worker     src/kernel/      OpenCascade (WASM) — the only │
│                                    code that ever touches OCCT   │
└───────────────────────────────────────────────────────────────┘
```

Three rules hold the layers apart, and most bugs we've fixed came from bending one of them:

1. **OCCT lives only in the Web Worker** ([worker.ts](../src/kernel/worker.ts)). The main thread talks to it through [KernelClient](../src/kernel/KernelClient.ts) with a typed request/response [protocol](../src/kernel/protocol.ts). Geometry comes back as `TypedArray`s moved with zero-copy transferables. This keeps the UI at full frame rate and lets us restart a crashed kernel without losing the page.
2. **React never enters the render loop** ([ADR 0004](adr/0004-viewport-react-boundary.md)). The [Viewport](../src/viewport/Viewport.ts) is a plain class that owns the renderer, camera, and every drag interaction. React only draws 2D panels. The two sides meet in the Zustand store: the viewport subscribes to selection/visibility/tool state, and UI subscribes to whatever it displays. The viewport never imports the document layer — it talks to it through the small `ViewportHost` interface it defines, implemented in [viewportHost.ts](../src/app/viewportHost.ts).
3. **Every document change is a `JournalOp`**. Nothing creates, edits, or deletes a body or a sketch stroke except by sending an op through the [DocumentController](../src/doc/DocumentController.ts).

## The input model: pen draws, fingers navigate

There is no sketch mode. This is the single most important thing to know about the UX, and it's modeled on Shapr3D:

| Input | Does |
|---|---|
| **Apple Pencil** (or mouse left button) | draw with the active tool, drag a handle, tap to select |
| **One finger** | orbit the camera (and tap to select). Before a Pencil has ever been seen, a finger can also draw, so desktop/touch-only testing works |
| **Two fingers** | pan + pinch-zoom; a quick two-finger *tap* is **undo**, three-finger tap is **redo** |
| Mouse right / middle button, wheel | orbit / pan / zoom |

[GestureController](../src/viewport/gestures.ts) is pure logic (no DOM, fully unit-tested). On every single-pointer press it asks the viewport `beginPrimary(x, y, pointerType)`, and the viewport answers with a role: `draw`, `manipulate` (a handle was grabbed), `orbit`, `pan`, or `none`. The order of the viewport's decision is:

1. the press lands on a **handle** → `manipulate`
2. a **sketch tool** is active and this pointer is allowed to draw → `draw`
3. otherwise → `orbit`

A press that turns out to be a tap (short and nearly stationary) cancels any draw/manipulate and becomes a selection tap instead — so a pen tap with a sketch tool active still selects, feels instant, and never leaves a zero-length stroke.

**Palm rejection** also lives in the gesture layer: touches are ignored while the pen is down or was active in the last 300 ms (hover counts), touches already resting on the screen when the pen lands are dropped, and oversized contact areas are treated as palms. This is verified by unit tests with fake pointer events but **has not been validated on real iPad hardware** — tune `PALM_WINDOW_MS` there.

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

**Sketches are part of the document too**, but they never touch the kernel. Each pen stroke is a `sketch` op (`add` curves / `remove` curve ids); the worker treats it as a no-op. [deriveSketches](../src/doc/sketches.ts) is a pure function that folds the journal into the current set of sketches (curves per sketch, plus which closed regions have already been extruded, tracked by a geometric fingerprint, `regionKey`). `DocumentController` re-derives after every change and hands the result to the viewport, so per-stroke undo, persistence, and deleting lines all fall out of the same journal machinery.

Replay is fault tolerant: if an op throws (OCCT can be finicky), it is skipped, the rest of the document still loads, and the history panel flags it. Only a fatal WASM abort stops a replay — and that triggers a worker restart.

Face and edge ids inside a body (`topoId`) are **not** stable across operations — a boolean or fillet renumbers them. That's acceptable because ops that use them (`fillet`, `shell`) record the ids that were valid at that point in the journal, and replay reaches the same state before running them. See [ADR 0002](adr/0002-topology-id-mapping.md).

## Life of a sketch-and-extrude

The signature interaction touches every layer, so it's a good map of the code:

1. **Pen down.** `beginPrimary` finds no handle and a sketch tool is active, so it calls `drawTargetAt`, which decides *which plane this stroke lives on*: the plane of an arc in progress → an existing sketch region under the pen → a planar model face (via the face's mesh normal, [meshGeometry.ts](../src/viewport/meshGeometry.ts)) → the ground. A curved face shows a toast instead. Strokes on the same plane and host body join the same sketch, so overlapping shapes cut each other into separate regions. The plane's basis comes from [planeFromNormal](../src/sketch/plane.ts), aligned to the world axes so grids match.
2. **Draw.** Each pointer move is ray-cast onto that plane, converted to plane `(u, v)` coordinates, snapped ([snapping.ts](../src/sketch/snapping.ts) — endpoints, midpoints, centers, horizontal/vertical, grid, plus the *model's* vertices and edge midpoints when drawing on a face), and fed to a tool state machine ([tools.ts](../src/sketch/tools.ts)) wrapped by [DrawController](../src/viewport/DrawController.ts), which owns the preview, snap marker, and hover cursor. A live dimension label follows the stroke.
3. **Pen up.** `DrawController` commits; the viewport calls `host.commitSketch`, which becomes a `sketch` op through `DocumentController.apply`. The document re-derives sketches and calls `Viewport.syncSketches`; each [SketchLayer](../src/viewport/SketchLayer.ts) asks the worker for the closed regions of its curves (`sketchRegions` — OCCT planar-graph analysis, stateless) and fills the ones not yet extruded.
4. **Select.** Tapping a region selects it. `computeHandles` turns that selection into an arrow [handle](../src/viewport/HandleLayer.ts): constant on-screen size, hit-tested in screen space with a finger-sized tolerance. The same mechanism provides push/pull on a planar face, three move axes on a body, and the orange fillet/chamfer/shell handle.
5. **Drag the handle.** `beginManipulation` captures the axis; `updateManipulation` converts screen drag to a distance along it ([extrudeMath.ts](../src/viewport/extrudeMath.ts)), snapped to 1 mm. The preview for extrude/push-pull is a pure-JS ghost prism ([ExtrudePreview.ts](../src/viewport/ExtrudePreview.ts)) — no kernel round-trips while dragging; blue when adding, red when the drag removes material. Fillet and shell previews do need the kernel: `previewOp` computes a result mesh without changing kernel state, throttled so only one request is in flight.
6. **Release.** The viewport builds an op (`extrude`, `pushPull`, `transform`, `fillet`, `shell`) and sends it through `host.commit`. The worker runs it — for extrude, rebuilding the region from the curves, sweeping a prism, and fusing or cutting against the host body, then merging coplanar faces so there are no seams — and the controller swaps in the new mesh, updates the store, journals the op, and schedules an autosave.
7. **Fine-tune.** After release, the dimension label stays tappable. Tapping it opens a numeric keypad; the value replaces the *last* op via `DocumentController.amendLast` (replay the journal minus the last entry, apply the new one; if it fails the original is restored).

## Recipe: adding a new modeling operation

Say you want to add **revolve**. You'll touch these files, roughly in order:

1. **[journal.ts](../src/doc/journal.ts)** — add a `{ kind: 'revolve', ... }` variant with everything replay needs (axis, angle, curves, and a `bodyId` the kernel can fill in). Add its history label in `opLabel` and, if it creates a body, its name in `aliveBodyNames` (TypeScript flags a missing `opLabel` case, but not a missing `aliveBodyNames` one — don't skip it).
2. **[worker.ts](../src/kernel/worker.ts)** — add a `case 'revolve'` to `applyJournalOp`. Use `claimBodyId` for new bodies, free every OCCT object you create (`.delete()`), and throw a plain `Error` with a user-readable message when OCCT says no.
3. **A test** — pure logic (labels, names, math) gets a Vitest unit test next to the source. OCCT code can't run under Vitest; verify it in the browser (see below).
4. **UI** — an action in [src/app](../src/app/) that calls `documentController.apply(...)`, and a button in the toolbar or [ContextBar](../src/ui/ContextBar.tsx). If it's a drag, give it an arrow: add a `HandleAction` variant in [HandleLayer.ts](../src/viewport/HandleLayer.ts), emit the handle from `Viewport.computeHandles`, and add a `case` in `Viewport.beginManipulation` that returns the op builder and label — drag math, preview, snapping, the dimension label, and amend-by-typing are shared.

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

- `npm run test` runs Vitest on everything that doesn't need WebGL or WASM: camera math, gestures (including pen/palm/multi-tap behavior), picking, sketch geometry, snapping, tool state machines, mesh-derived face geometry, the journal, sketch derivation, the document controller (with a fake kernel), and kernel crash recovery (with a fake worker).
- Kernel and rendering behavior is verified in a real browser. Drive the app through the console globals above, then check the store, the scene, or a screenshot.
- A browser tab that's hidden throttles `requestAnimationFrame` to about once per second, so camera animations barely progress and the dimension label doesn't publish. If an automated check depends on the camera settling, advance it manually: `while (__heph.viewport.rig.update(1/60)) {}`, and call `__heph.viewport.renderFrame()` to force a frame.
- To simulate the Pencil, dispatch `PointerEvent`s with `pointerType: 'pen'` on the canvas. **Project world points to the screen** (`new Vector3(x,y,z).project(vp.camera)`) instead of dragging along arbitrary screen diagonals — in an isometric view a diagonal can be parallel to a world axis and collapse a rectangle to a line.
- A full scripted pass (draw a rectangle with the pen → tap the region → drag the extrude handle → `applyDimensionValue(40)` → measure volume → select the top face → drag the push/pull handle → two-finger tap to undo) is the best smoke test. `docs/HANDOFF.md` lists what has and hasn't been verified on real hardware.
