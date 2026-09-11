# Kanban Project Review Profile

## Project
- `@alipay/dtazzicloud` — Kanban task management application for coding agents
- TypeScript monorepo with `web-ui/` React frontend and Node.js backend
- Local single-user desktop application (no server/cluster)

## Review Gates

### TypeScript
- No `any` types; prefer SDK-provided types over local redefinitions
- Standard top-level imports only — no inline/dynamic imports for types
- Upgrade dependencies rather than downgrading code to match stale types

### Architecture
- Single-responsibility files; extract shared logic into hooks/utilities
- Domain logic extraction preferred over presentation-only pass-through layers
- Avoid thin shell wrappers that only forward props for a single call site

### Design Decisions
- Storage: local filesystem + JSON index for lightweight data (no database)
- Atomic writes: write-then-rename pattern for file integrity
- UUID v4 for entity ID uniqueness (no auto-increment)
- Feature flags for module-level toggles

### Style
- Tailwind CSS v4, Radix UI primitives, Lucide icons (web-ui)
- Dark theme always — no `dark:` prefixes, no light-mode defaults
- Design tokens from `globals.css` `@theme` block