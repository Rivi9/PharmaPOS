# PharmaPOS UI guide

How the renderer is built, so new screens match the rest. Target: a Windows 10
touchscreen till with a mouse, keyboard and barcode scanner attached.

## shadcn/ui

- Initialised with the CLI: `components.json` at the repo root, style
  **radix-vega** (the classic new-york look), Tailwind v4, unified `radix-ui`
  package, `cn` from shadcn's `cn` package (re-exported by `lib/utils`).
- Add components with `npx shadcn@latest add <name>` from the repo root. Files
  land in `src/renderer/src/components/ui/` and are **owned by us**: after
  adding one, give it the touch sizes below.
- The CLI reads the `@renderer/*` alias from the root `tsconfig.json`
  (`compilerOptions.paths`); tsc ignores that block because the root config is
  solution-style.

## Touch sizes (already applied to the primitives)

| Control | Size |
| --- | --- |
| Button default / sm / lg / xl | 48 / 40 / 56 / 64 px (`xl` = Pay, Complete Sale) |
| Icon button default / sm / lg | 48 / 40 / 56 px |
| Input, Select trigger, InputGroup | 48 px |
| Select / Command / Dropdown rows | ≥ 48 px; search suggestions 56 px |
| Table header / row padding | 48 px header, 12 px cell padding |
| Checkbox / Radio / Switch | 24 px / 24 px / 28×48 px |
| Numpad keys | 64 px |

Body text is 16 px (`text-base`); `text-sm` only for secondary labels.

## Theme

Tokens live in `src/renderer/src/styles/globals.css` (`:root` light, `.dark`).
One teal brand colour (`primary`); `success`, `warning`, `info`,
`destructive` (+ `-muted` tints) are reserved for status. Use tokens only —
never `text-green-600`, `bg-amber-100` etc. — so dark mode works. Charts use
`--chart-1…5`. The theme preference (Light / Dark / System) is per machine in
localStorage (`hooks/useTheme.ts`), applied before first paint in `main.tsx`.

## Shared components (`components/common/`)

- **SearchCombobox** — every "type to find X and pick one" field (till product
  entry, stock-receive product picker). Picks on `click`, never
  `pointerdown`, so a finger scrolling the list never selects a row. Enter
  without arrowing calls `onSubmit` (barcode scanners).
- **SearchInput** — filter box above tables and lists.
- **NumberInput / QuantityStepper** — every numeric field. A text input with a
  numeric keypad that always puts the caret at the end; `type="number"`
  cannot take a caret position, and its spinner arrows are too small to hit.
- **ProductOption / StockBadge** — product rows and stock badges.

## Rules of thumb

- Select on `onClick`, never `onPointerDown` / `onMouseDown`.
- Transient notices → `toast` (sonner). Errors the user must read and fix
  (form fields, a failed print before sign-out) stay inline.
- Dialogs: big footer buttons (`size="lg"`/`"xl"`); a destructive confirm uses
  `variant="destructive-solid"`. If a dialog's first focusable element is a
  text field and the dialog also has a numpad, focus the dialog itself in
  `onOpenAutoFocus` — the numpad ignores keys while a text field has focus.
- Dates are local `YYYY-MM-DD` strings via `src/shared/dates.ts`; never
  `toISOString().split('T')[0]` (that is the UTC date).
- Visible labels, button names and ids are used by `tests/e2e` and the
  `run-pharmapos` driver — grep both before renaming one.

## Product search

`src/shared/product-search.ts` builds the ranked query used by the till and
the inventory list: every word must match name / generic / SKU / barcode, then
exact code > name prefix > generic prefix > word starts > substring, in-stock
first, shorter names first. Covered by `npm run test:search`. On 10k products
(M-series Mac) a query takes ~2–6 ms, ~12 ms for one letter; the till
dropdown starts at two letters.
