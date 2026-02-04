# Contributing to Codex

Thanks for your interest in contributing! Codex is a single-user personal knowledge base, and we welcome improvements that maintain this focus.

## Getting Started

1. **Fork** the repository and clone your fork
2. **Install dependencies**: `make install`
3. **Set up pre-commit hooks**: `pre-commit install` (ensures linting and checks run automatically)
4. **Start development**: `make dev`
5. **Run tests**: `make test`

See [.github/copilot-instructions.md](.github/copilot-instructions.md) for detailed architecture and development patterns.

## Contribution Workflow

### 1. Create an Issue First

Before starting work, [create an issue](../../issues/new) describing the bug or feature. This allows discussion before you invest time in a PR.

### 2. Development

- Create a branch from `main` (any name works)
- Follow existing patterns in the codebase
- Write tests for new features (see `server/tests/` and `client/src/components/*.test.tsx`)
- Ensure `make test` passes before submitting

### 3. Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

```
feat: add search highlighting
fix: resolve folder tree collapse bug
docs: update README with MCP instructions
test: add attachment upload tests
```

This format enables automatic changelog generation.

### 4. Pull Requests

- Link your PR to the issue (mention `Fixes #123` in description)
- Ensure CI checks pass (linting, tests, builds)
- Keep PRs focused - one feature or fix per PR

## Important Boundaries

### Single-User Architecture

Codex is designed as a **single-user application**. We're not interested in multi-user collaboration features due to the complexity of concurrent editing and git merge conflicts.

**Acceptable**: Features that support multiple isolated users (separate data directories, workspaces)
**Not Acceptable**: Collaborative editing, real-time sync, conflict resolution for concurrent edits

If you're unsure whether a feature aligns with this philosophy, ask in an issue first!

## Code Quality

- **No `any` types** - Use `unknown` with type guards
- **Path security** - Use `validatePath()` for user-provided paths (see `server/src/mcp/tools/attachments.ts`)
- **Input validation** - Zod schemas for API/MCP inputs
- **Tests required** - Maintain coverage for critical paths

## Questions?

Open an issue for clarification or discussion before starting work.

## License

By contributing, you agree your contributions will be licensed under the MIT License.
