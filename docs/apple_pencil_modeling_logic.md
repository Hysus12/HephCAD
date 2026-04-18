# Apple Pencil Modeling Logic

## Purpose

This document defines the intended Apple Pencil-led modeling interaction for HephCAD.
It is not a pixel-level UI clone of any commercial CAD app. It captures only high-level interaction principles that fit HephCAD's current architecture:

- Pencil-first geometry input
- selection-driven contextual tools
- low-clutter screen state
- direct manipulation for feature creation
- clear separation between navigation, sketching, and feature editing

This document is the source of truth for future HephCAD sketch/extrude interaction work.

## Current Problem

The current HephCAD sketch path is not reliable enough for real modeling because:

- Pencil input behaves too much like freehand stroke capture instead of precise sketch geometry entry
- viewer navigation, sketch input, and feature creation are not strongly separated into explicit interaction states
- closed profile truth is still too close to app-side heuristics instead of OCC-valid wire/face construction success
- `Extrude` appears too early relative to real sketch validity
- origin-plane sketch entry exists, but true plane/face-driven sketch entry is not yet the default path

The result is a workflow that looks partially implemented but is not trustworthy enough for sketch-to-solid modeling.

## Design Principles

### 1. Separate navigation from geometry input

- Apple Pencil is for geometry input and direct feature manipulation
- fingers are for camera/navigation on iPad
- trackpad is for navigation and selection on Mac

Do not overload Pencil with primary camera-navigation responsibility.

### 2. Context drives visible tools

HephCAD should only show actions that are valid for the current selection/state.

- nothing selected: no feature tools
- plane or planar face selected: show `Sketch`
- sketch mode without valid profile: show `Line`, `Arc`, `Spline`, `Done`
- valid closed profile: show `Extrude`
- valid profile plus axis/centerline in future: show `Revolve`
- selected solid body: show body-level actions such as isolate/hide/transparency

### 3. Geometry-first, not stroke-first

Sketch entities must become precise sketch primitives:

- line
- arc
- fit-point spline

Raw stroke samples are only an input method. They are not the final modeling representation.

### 4. OCC validity is the gate for feature creation

`Extrude` must only be surfaced when OCC can build:

- a valid wire
- then a valid face

HephCAD should not treat "looks visually closed" as equivalent to "valid closed sketch profile."

## Interaction State Machine

HephCAD should enforce a small number of explicit interaction states:

### `navigation`

Allowed:

- orbit
- pan
- zoom
- select plane / face / body

Not allowed:

- free sketch creation

### `sketch-ready`

Entry:

- user selects a sketchable plane or planar face
- user taps `Sketch`

Behavior:

- camera aligns normal to selected sketch plane
- sketch grid becomes visible
- only sketch tools are shown

### `sketching`

Behavior:

- Pencil creates sketch primitives
- inference/snapping is active
- 3D feature actions are hidden unless a valid profile exists

### `profile-ready`

Entry:

- sketch graph is OCC-valid as a face-producing closed profile

Behavior:

- show `Extrude`
- in future, show `Revolve` when a valid axis context exists

### `feature-edit`

Entry:

- user taps `Extrude`

Behavior:

- a direct-manipulation drag handle appears along the feature normal
- Pencil drag changes distance
- numeric HUD shows value
- confirm/commit creates the feature

## Pencil Logic on iPad

### Pencil responsibilities

Pencil is responsible for:

- selecting planes/faces for sketching
- placing sketch geometry
- selecting sketch regions
- dragging feature handles

Pencil is not responsible for:

- primary orbit/pan/zoom navigation
- opening large modal tool menus

### Finger responsibilities

Fingers are responsible for:

- two-finger pan
- pinch zoom
- empty-space orbit gesture

This separation should remain stable across future feature work.

## Trackpad Logic on Mac

Trackpad behavior should parallel the same model:

- pointer move / hover: preview selectable geometry
- click: selection
- empty-space drag: orbit
- two-finger drag: pan
- pinch: zoom
- contextual tools appear based on selection

The trackpad is not a sketch primitive generator. It is a navigation and selection device first.

## Sketch Entry

### Required default flow

1. User selects:
   - an origin plane, or
   - a planar face
2. HephCAD highlights the selected sketch context
3. HephCAD shows a single contextual action: `Sketch`
4. User enters sketch mode
5. Camera aligns to the sketch plane

### Temporary fallback

The current explicit `Top / Front / Right` plane entry may remain as a fallback during development, but it should not be the long-term primary flow.

## Sketch Primitive Logic

### Line

Target behavior:

1. Pencil down establishes start point
2. Pencil drag previews a precise line
3. Pencil up commits end point
4. snapping/inference may adjust endpoints

Line must be stored as a precise 2-point segment.

### Arc

Preferred v1 behavior:

- 3-point arc:
  - start
  - end
  - bulge/third point

If stroke fitting is used as an input convenience, the resulting entity must still be converted into a precise arc representation.

### Spline

Spline may use Pencil stroke sampling as input, but the final entity should be:

- fit points after simplification
- OCC-compatible curve construction

Spline is a sketch primitive, not a raw polyline.

## Sketch Topology Model

HephCAD should treat a sketch as a graph:

- nodes: snapped sketch vertices
- edges: line/arc/spline entities

Closed profile truth must come from topology and OCC construction, not only from screen-space heuristics.

### Closed-profile gate

The profile is "ready for feature creation" only when:

- edge connectivity is closed
- there is no invalid self-intersection for the intended profile
- edges lie on the same sketch plane
- OCC builds a valid wire
- OCC builds a valid face

If any of those fail:

- do not show `Extrude`
- show a short, factual status like `Profile is open` or `Profile is invalid`

## Extrude Logic

### Required v1 behavior

1. user selects or completes a valid closed profile
2. HephCAD shows `Extrude`
3. user taps `Extrude`
4. a drag handle appears along the sketch normal
5. Pencil drag sets distance
6. releasing or confirming creates the solid

### Minimum parameters

Only support:

- distance
- positive/negative direction

Do not block v1 on:

- draft angle
- symmetric mode
- to-object extent
- cut/join/intersect variants

## UI Guidance

### Keep visible tools minimal

In sketch mode, only show the tools relevant to the current state:

- `Line`
- `Arc`
- `Spline`
- `Done`
- `Extrude` only when valid

Do not show a large toolbar of future tools that are not implemented.

### Avoid false progress

If a control is not real:

- hide it, or
- explicitly classify it as placeholder in docs/handoff

Do not rely on UI that suggests more modeling capability than the implementation actually has.

## Recommended Implementation Order

### Phase A: make current sketch path truthful

1. replace screen-space closed-profile truth with OCC wire/face validation
2. make `Extrude` appear only after OCC-valid sketch face construction
3. ensure app state clearly distinguishes:
   - navigation
   - sketch-ready
   - sketching
   - profile-ready
   - feature-edit

### Phase B: improve sketch precision

1. make `Line` a true 2-point entity
2. make `Arc` a true 3-point arc
3. keep `Spline` as fit-point based
4. add endpoint snapping and simple inference

### Phase C: improve sketch entry

1. planar face selection should surface `Sketch`
2. entering sketch mode should align camera to the selected plane/face
3. origin-plane buttons become fallback, not primary entry

### Phase D: make extrude direct-manipulation

1. replace fixed-distance extrude commit with drag handle
2. show numeric depth feedback during drag
3. commit the feature on release/confirm

## What Not To Do

- do not redesign the app architecture for this
- do not replace OCCT
- do not build a giant all-tools toolbar
- do not let raw Pencil strokes become the modeling truth
- do not surface `Extrude` from app-side "looks closed" heuristics alone
- do not add more placeholder CAD controls

## Current Repo Alignment

As of this document:

- HephCAD already has a first Pencil sketch shell in code
- origin-plane sketch entry exists
- line/arc/spline capture exists
- an extrude path exists through OCCT
- the next required step is to make sketch validity and contextual tools trustworthy

This document should be used together with:

- [docs/agent_handoff_status.md](/Users/hysus/Documents/dev/3D_editor/HephCAD/docs/agent_handoff_status.md)

