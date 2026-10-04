# CLAUDE.md — DyPOS agent entry point

<!--
  Project identity for every coding agent.

  This file exists because an agent working in a folder inherits whatever
  config it finds THERE, and this repo used to carry a `.clauderc` whose
  contents belonged to a DIFFERENT project: it mandated `yarn` (this repo is
  npm-only — AGENTS.md records an earlier `postinstall: cd POS && yarn install`
  that floated versions and broke the build) and told agents to call
  `window.dypos.call` (a global that does not exist standalone, so following
  it silently disables every report — invariant 9 in AGENTS.md).

  One rule resolves both: THE REPO IS THE SOURCE OF TRUTH, AND AGENTS.md IS
  THE CONTRACT. Read AGENTS.md before touching anything; it is measured, and
  this file only points at it.

  Do NOT add package-manager, path or API-access rules here. Duplicating the
  contract is how the two copies drifted in the first place — the first thing
  a reviewer should reject in this file is a rule that AGENTS.md already owns.
-->

## Read first

- `AGENTS.md` — the full contract: invariants, verification commands, and the
  measured debt log. It is the single source for every rule below.
- `docs/TECH_DEBT_PAYDOWN.md` — what is already paid, and what remains.

## Verify before claiming done

From the repo root:

```bash
npm --prefix POS run test:run      # frontend suite
npm --prefix server test           # server suite
npm --prefix server run parity     # DDL single-source check
npm --prefix server run contract   # method-router coverage
```

## Scope

This file applies to **this repository only**. Other projects on this machine
are separate repositories with their own rules; never carry their conventions
in here, and never infer this repository's from theirs.