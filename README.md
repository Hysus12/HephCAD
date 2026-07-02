# HephCAD restart note

This repository was intentionally reset on 2026-07-03.

The previous scaffold was removed from the working tree because the project is being restarted from a clean base. The repository directory and Git history were kept. The old files were moved out of the repo instead of being permanently deleted.

Backup location on this machine:

```text
/Users/hysus/Documents/dev/3D_editor/HephCAD_pre_restart_backup_20260703_052645
```

Current state:

- The repo is intentionally minimal.
- No app scaffold, package manifest, CI, docs, or source tree is currently active.
- Future work should rebuild the project in small, verifiable steps.
- Do not assume the removed implementation represents the desired architecture.

Restart intent:

- Build a self-use iPad B-rep CAD app.
- Prioritize successful milestones, stability, and acceptance tests.
- Keep the first version narrow and buildable.
- Add architecture decisions before introducing uncertain or large dependencies.
