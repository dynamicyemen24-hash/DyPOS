# Plan: EOD Shift Report Auto-Print + Reprint

Date: 2026-05-24
Feature: EOD shift report print on closing shift

## Work Breakdown

### 1) Documentation

- Add design spec file under `docs/superpowers/specs/`
- Add implementation plan file under `docs/superpowers/plans/`

### 2) Backend (Print Data + Jinja hook)

- Create `DyPOS/DyPOS/utils/pos_closing_print.py`
  - implement `get_items_sold(doc)`
  - aggregate by `item_code`, `item_name`
  - sum `qty`, `amount`
  - order by `amount` descending
  - handle `sales_invoice` and `pos_invoice`
  - follow `POS Invoice.consolidated_invoice` when set
- Register Jinja method in `DyPOS/hooks.py`

### 3) Backend Tests

- Create `DyPOS/DyPOS/utils/tests/test_pos_closing_print.py`
  - verify mixed invoice references are handled
  - verify consolidated invoice path is followed
  - verify output shape uses float values

### 4) Print Format

- Add fixture:
  - `DyPOS/DyPOS/print_format/DyPOS_eod_report/DyPOS_eod_report.json`
- Configure:
  - `doc_type = POS Closing Shift`
  - `name = DyPOS EOD Report`
  - `module = DyPOS`
  - Jinja type with 80mm thermal styling
  - explicit LTR layout for receipt rows

### 5) Desk Reprint Action

- Update `DyPOS/DyPOS/doctype/pos_closing_shift/pos_closing_shift.js`
  - on submitted docs add custom button `Print EOD Report` under `Print`
  - call `frappe.utils.print` using `DyPOS EOD Report`

### 6) POS Frontend Auto-Print + Retry

- Update `POS/src/utils/printInvoice.js`
  - add reusable `silentPrintDoc(doctype, name, printFormat)`
- Create `POS/src/utils/printEod.js`
  - implement `printEODReport(closingShiftName)` with `silentPrintDoc`
- Update `POS/src/components/ShiftClosingDialog.vue`
  - after successful submit, resolve `result.name` first
  - attempt EOD print
  - on print failure:
    - warning toast
    - keep dialog open
    - show retry action
  - on retry success:
    - success toast
    - emit `shift-closed`
    - close dialog

### 7) Uninstall Cleanup

- Update `DyPOS/uninstall.py`
  - include `DyPOS EOD Report` in print format cleanup list

### 8) Validation

- Run migrate to sync print format:
  - `bench --site <site> migrate`
- Run backend tests:
  - `bench --site <site> run-tests DyPOS.utils.tests.test_pos_closing_print`
- Run frontend build:
  - `cd POS && npm run build`

## Sequenced Commits

1. `docs: spec EOD shift report auto-print + closing-shift reprint`
2. `docs: plan EOD shift report auto-print + closing-shift reprint`
3. `feat(eod): add EOD shift report print format + helper + Closing Shift button`
4. `feat(eod): auto-print EOD report on shift close with retry path`
5. `fix(eod): resolve closing shift name from submit response`
6. `fix(eod): follow consolidated_invoice for items + force LTR layout`
7. `feat(eod): polish DyPOS EOD Report print format`
