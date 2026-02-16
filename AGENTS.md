# AGENTS.md - Bases Kanban

Obsidian plugin providing a Kanban view for Bases.

## Commands

| Task | Command |
|------|---------|
| Dev build (watch) | `bun run dev` |
| Production build | `bun run build` |
| Type check only | `bun run typecheck` |
| Lint | `bun run lint` |
| Install deps | `bun install` |

**Note**: No test framework is configured in this project.

## Build System

- **Bundler**: esbuild (`esbuild.config.mjs`)
- **Package Manager**: Bun (bun.lock present)
- **Entry Point**: `src/main.ts` → `main.js`
- **Target**: ES2018, CommonJS format
- **External**: `obsidian`, `electron`, and CodeMirror packages are externalized

## TypeScript Configuration

- **Strict Mode**: Enabled (`strict: true`)
- **Module**: ESNext with bundler resolution
- **Target**: ES2018
- **Lib**: DOM, ES2022
- **Source Maps**: Inline (dev), none (prod)

Always include explicit return types on public/exported functions.

## Code Style

### Formatting

- **Indentation**: Tabs (not spaces)
- **Quotes**: Double quotes for strings
- **Semicolons**: Required
- **Trailing Commas**: Always use in objects/arrays
- **Line Endings**: Unix-style (LF)

### Naming Conventions

| Construct | Style | Example |
|-----------|-------|---------|
| Types/Interfaces | PascalCase | `BasesKanbanSettings` |
| Classes | PascalCase | `KanbanRenderer` |
| Functions | camelCase | `getColumnName()` |
| Variables | camelCase | `rootEl` |
| Constants (exported) | UPPER_SNAKE_CASE | `DEFAULT_SETTINGS` |
| Constants (local) | camelCase | `emptyColumnLabel` |
| Private members | `private` modifier | `private readonly plugin` |
| Boolean variables | Prefix with verb | `hasConfiguredGroupBy` |

### Imports

- Use `import type` for type-only imports
- Group imports: external libs first, then internal modules
- Sort imports alphabetically within groups
- Use named exports/imports preferentially

Example:
```typescript
import { App, BasesEntry } from "obsidian";
import type BasesKanbanPlugin from "./main";
import { DEFAULT_SETTINGS } from "./settings";
```

### Type Patterns

- Prefer `type` over `interface` for object shapes
- Use explicit return types on all functions
- Use `unknown` over `any` for catch clauses
- Nullable handling: check with `=== null` or `=== undefined`
- Use `Map` and `Set` for collections when appropriate

Example:
```typescript
export type RenderContext = {
  selectedProperties: BasesPropertyId[];
  groupByProperty: BasesPropertyId | null;
};

function getColumnName(groupKey: unknown): string | null {
  if (groupKey === null || groupKey === undefined) {
    return null;
  }
  return String(groupKey);
}
```

### Error Handling

- Use `try/catch` for async operations with vault operations
- Log errors with context: `console.error("Failed to trash ${file.path}:", error)`
- Show user-facing notices for recoverable errors via Obsidian's `Notice` API
- Validate JSON parsing with type guards

### DOM/CSS Patterns

- Use Obsidian's API for element creation (`createDiv`, `createEl`)
- Use CSS custom properties for theming (`--bases-kanban-column-width`)
- Dataset attributes for element identification (`data-card-path`)
- CSS classes use kebab-case: `bases-kanban-card`

## Project Structure

```
src/
├── main.ts                 # Plugin entry point
├── settings.ts             # Settings interface and UI
├── kanban-view.ts         # Main view component
└── kanban-view/
    ├── constants.ts       # String constants and keys
    ├── drag-controller.ts # Drag and drop logic
    ├── indexing.ts        # DOM element indexing utilities
    ├── mutations.ts       # File/vault mutations
    ├── options.ts         # View options configuration
    ├── renderer.ts        # DOM rendering
    └── utils.ts           # Helper functions
```

## Obsidian API Usage

- Extend `Plugin` for main plugin class
- Extend `BasesView` for custom views
- Use `PluginSettingTab` for settings UI
- Use `Menu`, `Modal`, `Notice` for UI interactions
- Access vault via `this.app.vault`

## CI/CD

- GitHub Actions run lint and build on every push/PR
- Release workflow triggers on tags, uploads `main.js`, `manifest.json`, `styles.css`
- Bun version: 1.1

## ESLint Rules

- Uses `typescript-eslint` recommended config
- Unused vars must start with `_` (ignored)
- Ignores: `old-version/`, `node_modules/`, `main.js`, `versions.json`
