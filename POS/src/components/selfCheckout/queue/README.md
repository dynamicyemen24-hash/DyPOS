# DyPOS Queue Management System

Production-grade queue management architecture.

## Core capabilities

- Queue ticket lifecycle
- Smart cashier integration
- Next / recall / skip / complete / transfer
- Priority and service rules
- Real-time synchronization
- Voice announcements
- Customer display
- Queue dashboard
- Counter monitoring
- Operational telemetry
- Accessibility
- RTL / LTR readiness

## Architectural rules

1. Domain logic must remain independent from React.
2. UI components must not directly access infrastructure.
3. API and realtime implementations belong to infrastructure.
4. Queue state transitions must pass through domain rules.
5. Voice must be provider-independent.
6. Cashier integration must use an explicit application contract.
7. No mock data in production paths.
8. No direct localStorage business state.
9. No duplicated queue state.
10. All mutations must be traceable as queue events.

## Runtime flow

Self Checkout
    ↓
Ticketing
    ↓
Queue Domain
    ↓
Queue Orchestrator
    ↓
Realtime Event
    ├── Smart Cashier
    ├── Customer Display
    ├── Voice Announcement
    └── Management Dashboard
