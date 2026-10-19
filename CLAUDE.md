# PharmaPOS - Project Instructions

## Git Worktrees

Use `.worktrees/` directory for isolated development branches (project-local, hidden).

## Commit Style

Always commit without Co-Authored-By attribution.

## Target Device

POS Machine with windows 10 and touch screen. It also includes a customer display on the other side.

## UI

Renderer is shadcn/ui (radix-vega, Tailwind v4) with touch-sized primitives. Read `docs/UI-GUIDE.md` before building or changing screens: use tokens not raw colours, `components/common/` for search and number fields, select on click not pointerdown.

## Developing on macOS

Allowed only inside a `.worktrees/<name>` worktree (`npm ci`, then @electron/rebuild via its API — see `docs/BUILDING.md`). Never install in the main checkout.
