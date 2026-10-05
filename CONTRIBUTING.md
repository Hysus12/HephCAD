# Contributing to HephCAD

Thanks for wanting to help build open, touch-first CAD. The codebase is still small enough to understand in an afternoon — start with [docs/architecture.md](docs/architecture.md), which walks through how a drag-extrude flows through every layer and gives a step-by-step recipe for adding a new modeling operation.

## Getting set up

```bash
npm install
npm run dev          # http://localhost:5173 — also reachable from an iPad on the same network
```

The first load downloads the ~50 MB OpenCascade WASM kernel; the "幾何核心載入中…" pill disappears when it's ready. Everything runs in the browser — there's no backend.

Before opening a pull request, run the same checks CI does:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## Ways to help

You don't need to know CAD internals to make a real difference:

- **Use it on an iPad and report what feels wrong.** Touch interaction is the whole point of this project, and it can only be tuned on real hardware. "I tried to select that edge five times and kept getting the face" is a valuable bug report. Include the iPad model and iPadOS version.
- **Pick something from the roadmap** in the [README](README.md#future-work). Rotation, offset face, numeric input during drags, and section-view cap faces are all well-scoped.
- **Harden the kernel layer.** OpenCascade operations fail in surprising ways; reproducing a failure as a small journal and making the error message clearer is genuinely useful.
- **Shrink the WASM build.** The kernel is a full OCCT build. A custom build with only the toolkits we use would cut first-load time dramatically — see [ADR 0001](docs/adr/0001-web-wasm-stack.md).
- **Improve these docs** whenever something confused you. If it confused you, it'll confuse the next person.

## How we work

- **Small, verifiable changes.** A PR should do one thing and say how you checked it worked. For UI or kernel changes, a before/after screenshot or a console snippet goes a long way.
- **Decisions before dependencies.** Anything architectural or that adds a significant dependency gets a short ADR in [docs/adr](docs/adr/) first, so the reasoning outlives the PR. Look at the existing ones for the format — they're a page or less.
- **Keep the layer rules** described in the architecture doc: OCCT only in the worker, React out of the render loop, every geometry change as a journal op. They're what make undo, autosave, and crash recovery work without extra effort.
- **Test the pure parts.** Math, state machines, and document logic get Vitest unit tests next to the source file. Code that needs WebGL or WASM is verified in the browser; say how in your PR.
- **Match the surrounding code.** Comments in the source are in Traditional Chinese (the project started that way); English is welcome in new comments, docs, issues, and PRs. Prefer explaining *why* over *what*.

## Reporting bugs

Open an issue with:

1. What you did (the gesture sequence, or the steps in the UI).
2. What you expected and what happened instead.
3. Device and browser (e.g. iPad Pro 11" M2, iPadOS 18.4, Safari).
4. If the kernel was involved, any message in the history panel (failed operations are marked in amber; hover to see the reason).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
