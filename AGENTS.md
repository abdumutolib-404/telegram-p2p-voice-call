# Development repository

- `origin` is the development repository. The separately configured `production` remote is outside the default scope of pushes and deployments.
- When the user asks to push this project's work, publish it to `origin/main`. Do not create or push a feature branch unless the user explicitly requests one.
- The primary checkout is `D:/telegram-p2p-voice-call`, where `main` is checked out. If working in a detached or temporary worktree, transfer the completed changes to that checkout while preserving any existing uncommitted work, then push `main` normally.
- Check that the development frontend builds use the new main commit. A feature-branch push or a local preview does not establish that the deployed UI has changed.
