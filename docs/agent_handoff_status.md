# Agent Handoff Status

## Repo Purpose

HephCAD is a self-use, iPad-first CAD app focused on B-rep modeling rather than mesh editing. The intended direction is a touch-first CAD workflow on iPadOS with Open CASCADE Technology (OCCT) as the geometry kernel, local-first usage, and small verified milestones rather than a commercial-CAD-sized feature jump.

Platform focus:
- iPadOS first
- current active build path is `iphoneos`
- iPhone-first UX is explicitly not a goal

## Current Scope

Phase 1 currently means:
- app shell launches on iPad
- OCCT-backed viewer can show a demo B-rep body
- camera interaction exists for orbit / pan / zoom
- transparency is wired through the real viewer path
- bundled STEP sample import path exists
- selection, isolate, and reference image controls are present in the current architecture and UI flow

Explicitly out of scope for now:
- cloud / auth / collaboration
- full history tree
- assemblies / mating
- 2D drawings
- mesh editing
- Phase 2+ import/export expansion beyond the established roadmap
- speculative feature work outside the roadmap

## Architecture Snapshot

App structure:
- `apps/ipad/HephCADApp`: SwiftUI/UIKit app shell, workspace, viewer container, inspector
- `Sources/HephCADKernelBridge`: Objective-C++ bridge and OCCT-backed kernel/viewer integration
- `Sources/HephCADViewerBridge`: UIKit viewer controller and GL view wrapper
- `Sources/HephCAD*` Swift modules: domain, scene/reference-image state, telemetry, IO scaffolding

OCCT role:
- geometry kernel
- STEP/XDE import path
- real viewer/runtime path for the current demo body and scene rendering

Current dependency build path:
- OCCT iOS libs are built from source with `CMake + Ninja`
- entrypoint script: [scripts/build_occt_ios.sh](/Users/hysus/Documents/dev/3D_editor/HephCAD/scripts/build_occt_ios.sh)
- explicit Xcode SDK paths and Xcode toolchain `clang/clang++` are required
- install output consumed by the app remains:
  - `third_party/build/occt/install/iphoneos`
  - `third_party/build/occt/install/iphonesimulator`

App build path:
- checked-in Xcode project: [apps/ipad/HephCADApp.xcodeproj](/Users/hysus/Documents/dev/3D_editor/HephCAD/apps/ipad/HephCADApp.xcodeproj)
- build verification entrypoint: [scripts/run_ios_build_check.sh](/Users/hysus/Documents/dev/3D_editor/HephCAD/scripts/run_ios_build_check.sh)
- Apple Pencil / trackpad modeling interaction source of truth: [docs/apple_pencil_modeling_logic.md](/Users/hysus/Documents/dev/3D_editor/HephCAD/docs/apple_pencil_modeling_logic.md)

Runtime/viewer path:
- `HCADViewerViewController` hosts the real viewer interaction path
- `HCADKernelSession` owns the OCCT viewer/session wrapper
- `HCADOcctViewer` drives the current OCCT sample-style viewer route
- reference image is currently a UIKit overlay driven by inspector state, not an in-scene OCCT textured plane

File format scope:
- current real Phase 1 editable path: STEP import through `STEPCAFControl_Reader` / XDE
- STL / OBJ / 3MF remain out of active runtime implementation for now

Current document/runtime assumptions:
- single-document style runtime
- `HCADOcctDocument` currently initializes `BinXCAF` documents
- body state is mirrored into `WorkspaceState`
- inspector manipulates state that is pushed back into the viewer/kernel session

## Verified Current Status

Build/link status proven:
- `scripts/run_ios_build_check.sh` succeeds for the current `iphoneos` path
- app build and link are currently good enough for device runtime attempts
- `iphonesimulator` warnings still exist but are not the current blocker

Device/runtime status reported as working:
- app launches on a real iPad
- UI shell is visible
- a demo 3D model is visible
- basic viewing works
- transparency works

Runtime features currently treated as verified working:
- app launch
- shell/workspace visibility
- demo model visibility
- basic viewer interaction at least at a coarse level
- transparency control path

Visible UI or functionality that should be treated cautiously:
- `Import STEP` button is wired to bundled sample import and now forces a viewer scene reload when the active document changes, but it should not be treated as fully device-validated unless rechecked on iPad in the current build
- `Isolate` button is wired in state/viewer flow, and STEP import now clears stale isolation state when switching away from the demo scene, but isolate should still be treated as needing device revalidation
- reference image controls are wired in inspector and viewer overlay flow, but should not be treated as validated unless rechecked on device
- tapping a body in the inspector selects app state, but there is no confirmed reverse viewer highlight/update path from inspector selection back into the OCCT view
- plane-based `Pencil Sketch` entry is now implemented in the app shell for `Top`, `Front`, and `Right` origin planes
- line / arc / fit-point spline stroke capture, closed-profile detection, and contextual `Extrude` surfacing are now implemented in code, but they should be treated as pending device validation until the full Pencil path is exercised on iPad
- the sketch path now uses OCC closed-profile validation before surfacing `Extrude`, and line endpoints now snap to existing sketch endpoints with a small orthogonal assist for rectangular profiles
- `Revolve` is still not implemented and is intentionally not surfaced as an active tool yet

UI that is present but should be treated as placeholder/non-CAD-authoring UI:
- visible CAD/construction buttons outside the currently wired Phase 1 controls should be assumed placeholder unless explicitly validated

Not implemented yet:
- face-picked sketch entry from real solid faces
- revolve / cut authoring
- boolean/pattern authoring UI
- helix / spring / thread feature generation
- STL/OBJ/3MF runtime workflows
- robust file/document management

## Known Limitations / Warnings

Non-blocking warnings:
- Xcode still warns about missing `iphonesimulator` OCCT library search paths during `iphoneos` app link
- `grid.png` copy step emits a pngcrush warning but does not currently block the build

Missing implementations:
- most actual CAD construction/modeling operations
- production-quality import/export flows beyond the current STEP demo path
- on-canvas reference image gizmos
- deeper selection semantics and editing workflows
- Pencil sketch mode currently targets origin planes, not arbitrary picked faces
- sketch entities are converted to an extrudable closed profile with a lightweight app-side sketch model; they are not yet backed by a full persistent CAD sketch system
- the current Pencil sketch path is more trustworthy for solid construction than before, but still needs device validation for the full plane -> line(s) -> valid profile -> extrude workflow

Known risks:
- OCCT iOS runtime path still depends on the current OpenGL ES sample-style route
- runtime behavior beyond the already reported iPad checks is not yet comprehensively revalidated
- the UI can look more complete than the implementation actually is; future agents must distinguish visible controls from real modeling capability

## Recommended Next Steps

Preferred order:
1. Re-run and record concrete device validation for:
   - orbit / pan / zoom
   - STEP import
   - selection -> inspector update
   - isolate
   - reference image controls
   - plane entry -> Pencil line/arc/spline -> closed profile -> extrude
2. Mark each of those as either:
   - verified working
   - visible but placeholder
   - wired but not validated
   - broken with a concrete runtime blocker
3. Fix only the first concrete runtime blocker discovered on device
4. After the current `iphoneos` runtime path is stable enough, finish `iphonesimulator` OCCT dependency output
5. Only then continue Phase 1 implementation gaps in small, testable steps

Smallest slice completed after this checkpoint:
- viewer scene reload is now explicitly tied to document/scene revision changes in SwiftUI state, so STEP import is less likely to appear as a shell-only action with stale demo geometry still on screen
- a first Pencil-led modeling slice now exists in code: select an origin sketch plane, draw line/arc/spline entities with Pencil, detect a closed profile, and trigger a real OCCT extrude into a visible solid body

What should not be touched yet:
- app architecture
- OCCT kernel choice
- ObjC++ bridge boundary
- broad UI redesign
- Phase 2 features
- speculative cleanup/refactors
- linker/search-path cleanup that is not proven necessary

## Rules for Future Agents

- Preserve the current architecture.
- Avoid unnecessary changes.
- Prefer small, testable steps.
- Use actual linker/runtime output as the source of truth.
- Do not confuse visible UI with implemented CAD functionality.
- Do not describe features as complete unless they are built, exercised, and observed.
- When a runtime issue appears, fix the first concrete blocker before touching anything broader.
