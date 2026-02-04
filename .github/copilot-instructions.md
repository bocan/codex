# Codex - AI Coding Instructions

## Architecture Overview

Codex is a **full-stack TypeScript** monorepo using npm workspaces with three packages:
- **Root** (`/`) - Workspace orchestration, shared devDependencies
- **Server** (`/server`) - Express REST API on port 3001 + MCP server on port 3002
- **Client** (`/client`) - React SPA on port 3000 (Vite dev server proxies `/api` to server)

**Data flow**: React components → `api.ts` service → Express routes → `FileSystemService` → `/data` directory (markdown files).

**MCP flow**: AI agents → MCP server (port 3002) → MCP tools → `FileSystemService` → `/data` directory.

**Production mode**: Express serves both API and static React build from port 3001 only (see `server/src/index.ts` static file serving section).

### MCP Server Architecture

The Model Context Protocol (MCP) server allows AI agents to interact with Codex programmatically:

- **Location**: `server/src/mcp/` - Separate from REST API
- **Port**: 3002 (configurable via `MCP_PORT`)
- **Protocol**: HTTP-based MCP with session management
- **Tools**: 16 registered tools (pages, folders, attachments)
- **Resources**: Access pages via `codex://page/{path}` URIs
- **Security**: API key authentication via `MCP_API_KEY` environment variable

**Tool registration pattern**: All tools imported in `server/src/mcp/tools/registry.ts` and wrapped with `asRegisteredTool()`. Each tool uses Zod schemas for input validation and returns structured `ToolResult` objects.

## Critical Commands

```bash
make dev          # Start both server (3001) and client (3000)
make test         # Run all tests (server: Jest, client: Vitest)
make install      # Fresh install all dependencies from root
make build        # Build both server and client for production
```

**MCP Development**:
```bash
MCP_ENABLED=true npm run dev -w server    # Start server with MCP on port 3002
npm run dev:mcp -w server                 # Dedicated MCP dev script
```

> **Important**: Dependencies install at the root level only. Run `npm ci` or `make install` from root, not from subdirectories. The root `package-lock.json` manages all workspace dependencies.

## Docker Deployment

```bash
docker compose up -d --build    # Build and run (port 3001 serves both UI and API)
docker compose logs -f codex    # View logs
```

**Authentication caveat**: Session cookies use `secure: "auto"`. For local Docker testing without HTTPS, run passwordless (comment out `AUTH_PASSWORD`). For production, deploy behind a reverse proxy with `TRUST_PROXY=true` to respect `X-Forwarded-Proto` headers.

## Project Conventions

### API Pattern
Routes follow REST conventions in `server/src/routes/`. Each route delegates to a controller, which calls `FileSystemService`:

```
routes/*.ts → controllers/*Controller.ts → services/fileSystem.ts
```

Self-documenting API available at `GET /api` returns all endpoints with examples.

### Frontend Pattern
- All API calls go through `client/src/services/api.ts{api,auth,mcp}.test.ts`, uses isolated `test-data/` or `test-data-mcp/` directories
- **Client tests**: Vitest + React Testing Library, co-located with components
- **MCP tests**: Comprehensive unit and integration tests in `server/tests/mcp.test.ts`
- Tests must clean up: server tests recreate `TEST_DATA_DIR` in `beforeEach`
- **Test count verification**: When adding MCP tools, update `mcp.test.ts` to expect correct tool count (currently 16)
- CSS uses custom properties from `App.css` for theming: `var(--bg-primary)`, `var(--text-primary)`, etc.
- Keyboard navigation uses arrow keys AND vim-style `j`/`k` (see `FolderTree.tsx`, `PageList.tsx`, `Search.tsx`)

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
| AEST API routes | `server/src/routes/{folders,pages,attachments,auth}.ts` |
| **MCP tool registry** | `server/src/mcp/tools/registry.ts` |
| **MCP tool implementations** | `server/src/mcp/tools/{pages,folders,attachments}.ts` |
| **MCP server** | `server/src/mcp/server.ts` |
| **MCP configuration** | `server/src/mcp/config.ts` |
| Type definitions (client) | `client/src/types/index.ts` |
| Type definitions (MCP) | `server/src/mcp/tools/types.ts` |
| Theme variables | `client/src/App.css` (`:root` and `[data-theme="dark"]`) |
| Test setup | `server/tests/{api,auth,mcp}/types/index.ts` |
| Theme variables | `client/src/App.css` (`:root` and `[data-theme="dark"]`) |
| Test setup | `server/tests/api.test.ts`, `client/src/test/setup.ts` |
| Docker config | `Dockerfile`, `docker-compose.yml` |
| CI/CD workflows | `.github/workflows/{ci.yml,release.yml}` |

## Adding Features

**New API endpoint**:
1. AddMCP tool**:
1. Create tool in `server/src/mcp/tools/{category}.ts` using `defineTool()` helper
2. Define Zod schema for input validation
3. Implement handler that returns `ToolResult` with `content` array
4. Export tool and import in `server/src/mcp/tools/registry.ts`
5. Add to `tools` array using `asRegisteredTool()`
6. Add test in `server/tests/mcp.test.ts` and update tool count expectation
7. **Path security**: Always use `validatePath()` for user-provided paths to prevent traversal attacks

**New  method to `FileSystemService` in `server/src/services/fileSystem.ts`
2. Create controller function in `server/src/controllers/`
3. Add route in `server/src/routes/` and import in `server/src/index.ts`
4. Add client method in `client/src/services/api.ts`
5. Add test in `server/tests/api.test.ts`
6. Update API docs in `GET /api` handler (`server/src/index.ts`)

**New UI component**:
1. Create `Component.tsx` and `Component.css` in `client/src/components/` (`AUTH_PASSWORD`, `MCP_API_KEY`, `SESSION_SECRET`)
- **Path traversal protection**: Always use `validatePath()` helper (see `server/src/mcp/tools/attachments.ts`) for user-provided file paths
- **Input validation**: Use Zod schemas for all MCP tool inputs and API request validation
- Keep dependencies up to date (monitored by Dependabot)
- CSP directives configured in `server/src/index.ts` helmet middleware
- **MCP authentication**: Require `MCP_API_KEY` in production; verify via `Authorization: Bearer` or `X-Api-Key` headers

## Code Quality Standards

### TypeScript
- **Never use `any` type** - Use `unknown` for truly dynamic types, then narrow with type guards
- Always enable strict mode in tsconfig.json
- Prefer interfaces over type aliases for object shapes
- Use proper typing for all function parameters and return values

### Security
- **Never commit secrets** - Use environment variables for sensitive data
- Sanitize file paths and validate user input to prevent path traversal attacks
- Keep dependencies up to date (monitored by Dependabot)
- CSP directives configured in `server/src/index.ts` helmet middleware

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

## Git Commands

Use modern Git commands instead of legacy `git checkout`:

| Instead of | Use |
|------------|-----|
| `git checkout <branch>` | `git switch <branch>` |

## MCP Tool Development Patterns

### Tool Definition Example
```typescript
export const exampleTool = defineTool({
  name: 'tool_name',
  description: 'Clear description for AI agents',
  inputSchema: z.object({
    param: z.string().describe('Parameter description'),
  }),
  annotations: {
    readOnlyHint: true,  // Optional: marks tool as read-only
  },
  handler: async (args, context) => {
    // Check for cancellation
    if (context.signal?.aborted) {
      return { content: [{ type: 'text', text: 'Cancelled' }], isError: true };
    }

    try {
      // Implementation using FileSystemService
      const result = await someOperation(args.param);

      return {
        content: [{ type: 'text', text: `Success: ${result}` }],
        structuredContent: { key: result },  // Optional structured data
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  },
});
```

### Attachment Handling
- Attachments stored in `.attachments` subdirectories within folders
- Use base64 encoding for file content transfer (MCP limitation)
- Images return with `type: 'image'` content type in MCP responses
- Always validate paths and handle `ENOENT` errors gracefully
- Prevent filename collisions by appending timestamps when needed
| `git checkout -b <branch>` | `git switch -c <branch>` |
| `git checkout -- <file>` | `git restore <file>` |
| `git checkout HEAD -- <file>` | `git restore --source=HEAD <file>` |

**Never suggest or document `git checkout`** - always use `git switch` for branches and `git restore` for files.

## CI/CD Notes

- **CI** (`ci.yml`): Runs on PRs - linting, tests, build verification
- **Release** (`release.yml`): Auto-runs on merge to main - bumps version via `commit-and-tag-version`, creates GitHub Release with auto-generated notes
- Uses Node 24.x, npm workspaces (single lock file at root)
