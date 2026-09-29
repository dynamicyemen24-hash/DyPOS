# DyPOS Design System & UX Standard

**Version:** 2.1 Production UX Baseline  
**Scope:** POS, back-office, reports, settings, authentication, touch, keyboard, RTL/LTR, light/dark themes.

## 1. Design-system architecture

DyPOS uses a layered design-system contract:

1. **Raw tokens** — styles/dypos/tokens.css: palette, type, spacing, radii, elevation, controls, motion and layout primitives.
2. **Semantic themes** — styles/dypos/themes.css: background, surface, text, border and state roles. Components must consume semantic roles rather than raw palette values.
3. **Accent system** — styles/dypos/accents.css: brand/accent variants. Accent changes must not alter success, danger, warning or information semantics.
4. **Base interaction layer** — styles/dypos/base.css: reset, focus, selection, form and logical-direction behavior.
5. **Component layer** — styles/dypos/components.css: shared visual grammar for buttons, cards, fields, tables, dialogs, navigation and POS controls.
6. **Motion layer** — styles/dypos/animations.css: purposeful transitions with reduced-motion fallbacks.
7. **Utility/density layers** — utilities.css and density.css: controlled composition and POS-specific density.

index.css is an entry point, not a second design system.

## 2. UX principles

- **Transaction first:** checkout, payment, stock and shift actions remain visually dominant.
- **State is explicit:** online/offline/syncing/pending/error states use semantic color, iconography and text; color alone is never the only signal.
- **Low cognitive load:** one primary action per surface; destructive actions require explicit confirmation where irreversible.
- **Stable layout:** loading, error and empty states reserve predictable space and avoid layout jumps.
- **Touch + keyboard parity:** every core cashier action is usable with pointer/touch and keyboard.
- **RTL first, not RTL patched:** layout uses logical properties and direction-aware composition wherever practical.
- **Arabic-first typography:** Arabic UI uses Cairo; Latin-heavy technical/numeric content may use Inter.
- **Financial legibility:** monetary values use tabular numerals and strong hierarchy; totals are visually unambiguous.

## 3. Accessibility contract

The UI baseline targets WCAG 2.2 AA practices:

- visible focus-visible indicators;
- minimum 44px touch target for primary interactive controls;
- semantic labels and accessible names;
- status/error messaging exposed to assistive technology;
- prefers-reduced-motion support;
- forced-colors support for operating-system high-contrast modes;
- prefers-contrast enhancement without depending on it for correctness;
- no information conveyed by color alone;
- dialogs, menus and popovers must preserve focus and escape semantics.

Accessibility conformance is validated by automated tests plus manual/assistive-technology review; CSS alone is not certification.

## 4. Theme contract

Supported modes:

- light — default visual baseline;
- dark — complete semantic counterpart;
- system — follows the OS preference.

Supported accents are independent of theme semantics. Persisted preferences are synchronized across tabs. A theme switch must not reset transactional component state.

## 5. Density contract

- comfortable is the default for mixed touch/desktop operation.
- compact is for high-throughput desktop POS workflows.
- Density changes may alter spacing/control heights but must not violate minimum accessibility touch targets for critical actions.

## 6. Component states

Every reusable interactive component should define, where applicable:

default → hover → focus-visible → active → disabled → loading → success/error → selected

Async actions must prevent duplicate submission while preserving an understandable busy state. Error states must explain recovery, not merely report failure.

## 7. Responsive behavior

The application is designed around content and workflow breakpoints rather than device names. At narrow widths, secondary navigation collapses before primary transaction controls; tables may transform into readable cards/list rows where horizontal scrolling would obscure critical financial fields.

## 8. Motion

Motion is functional: feedback, continuity and hierarchy only. Avoid decorative motion on checkout-critical paths. prefers-reduced-motion: reduce disables non-essential animation.

## 9. Quality gates

A UI change is production-ready only when:

1. semantic tokens are used instead of new ad-hoc colors;
2. light/dark behavior is verified;
3. RTL and LTR layouts are checked;
4. keyboard and focus behavior is preserved;
5. reduced-motion and forced-colors behavior is preserved;
6. touch targets remain compliant;
7. loading/empty/error/success states exist where applicable;
8. visual regression or component tests cover the changed behavior;
9. no business/financial logic is embedded in presentation-only CSS/components.

## 10. Definition of Done — UX

**Specified → Designed → Implemented → Tested → Accessibility-reviewed → Responsive-reviewed → Theme-reviewed → Accepted.**

The repository's functional/non-functional requirements remain the authoritative product acceptance layer; this document defines the visual/interaction implementation baseline.


## Enterprise UX reference profile

For enterprise workflow architecture, apply `docs/ENTERPRISE_UX_ARCHITECTURE.md`. It defines Fiori-aligned role-based/responsive/simple/coherent principles and Odoo-inspired modularity, without copying proprietary assets or claiming certification.
