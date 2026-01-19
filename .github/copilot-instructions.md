# Disnotion - AI Coding Instructions

## Architecture Overview

Disnotion is a **full-stack TypeScript** monorepo using npm workspaces with three packages:
- **Root** (`/`) - Workspace orchestration, shared devDependencies
- **Server** (`/server`) - Express REST API on port 3001
- **Client** (`/client`) - React SPA on port 3000 (Vite dev server proxies `/api` to server)

**Data flow**: React components → `api.ts` service → Express routes → `FileSystemService` → `/data` directory (markdown files).

## Critical Commands

```bash
make dev          # Start both server (3001) and client (3000)
make test         # Run all tests (server: Jest, client: Vitest)
make install      # Fresh install all dependencies from root
```

> **Important**: Dependencies install at the root level only. Run `npm ci` from root, not from subdirectories. The root `package-lock.json` manages all workspace dependencies.

## Project Conventions

### API Pattern
Routes follow REST conventions in `server/src/routes/`. Each route delegates to a controller, which calls `FileSystemService`:

```
routes/*.ts → controllers/*Controller.ts → services/fileSystem.ts
```

Self-documenting API available at `GET /api` returns all endpoints with examples.

### Frontend Pattern
- All API calls go through `client/src/services/api.ts` - never call axios directly from components
- Types are defined once in `client/src/types/index.ts` and reused
- Each component has a co-located `.css` file and `.test.tsx` file
- CSS uses custom properties from `App.css` for theming: `var(--bg-primary)`, `var(--text-primary)`, etc.

### Testing
- **Server tests**: Jest + supertest in `server/tests/api.test.ts`, uses isolated `test-data/` directory
- **Client tests**: Vitest + React Testing Library, co-located with components
- Tests must clean up: server tests recreate `TEST_DATA_DIR` in `beforeEach`

### TypeScript
- Server: `tsconfig.json` includes `"types": ["node", "jest"]` for test support
- Client: Standard Vite/React config with strict mode
- Shared interfaces (`FolderNode`, `FileNode`, `Page`) defined in client, server has own copy in `fileSystem.ts`

## Key Files

| Purpose | Location |
|---------|----------|
| API service (client) | `client/src/services/api.ts` |
| File operations | `server/src/services/fileSystem.ts` |
| Route definitions | `server/src/routes/{folders,pages}.ts` |
| Type definitions | `client/src/types/index.ts` |
| Theme variables | `client/src/App.css` (`:root` and `[data-theme="dark"]`) |
| Test setup | `server/tests/api.test.ts`, `client/src/test/setup.ts` |

## Adding Features

**New API endpoint**:
1. Add method to `FileSystemService` in `server/src/services/fileSystem.ts`
2. Create controller function in `server/src/controllers/`
3. Add route in `server/src/routes/` and import in `server/src/index.ts`
4. Add client method in `client/src/services/api.ts`
5. Add test in `server/tests/api.test.ts`

**New UI component**:
1. Create `Component.tsx` and `Component.css` in `client/src/components/`
2. Use CSS variables for colors (supports dark mode)
3. Create `Component.test.tsx` alongside
4. Import in parent component

## Code Quality Standards

### TypeScript
- **Never use `any` type** - Use `unknown` for truly dynamic types, then narrow with type guards
- Always enable strict mode in tsconfig.json
- Prefer interfaces over type aliases for object shapes
- Use proper typing for all function parameters and return values

### Security
- **Never commit secrets** - Use environment variables for sensitive data (see `.env.example`)
- Always validate and sanitize user input on both client and server
- Use parameterized queries to prevent injection attacks
- Keep dependencies up to date (monitored by Dependabot)

### Testing
- Write tests before pushing code
- Maintain test coverage for critical paths
- Tests must be deterministic and clean up after themselves
- Use descriptive test names that explain the behavior being tested

## Boundaries - Do NOT Modify

- **Never modify** files in `node_modules/` or `dist/` directories
- **Never modify** the root `package-lock.json` directly (use `npm install` commands)
- **Do not remove** existing tests unless they are explicitly broken by intended changes
- **Do not change** the npm workspace structure without discussion

## CI/CD Notes

GitHub Actions runs `npm ci` at root level (Node 24.x), then runs tests/builds in subdirectories. Dependabot monitors the root package.json weekly (npm workspaces means one lock file manages all deps).
