# Codex MCP Server

The Codex MCP (Model Context Protocol) server allows AI agents like Claude, GitHub Copilot, and other MCP-compatible clients to interact with your documentation wiki.

*Architecture inspired by [streamable-mcp-server-template](https://github.com/iceener/streamable-mcp-server-template)*

## Quick Start

1. **Set an API key** for security:
   ```bash
   export MCP_API_KEY=your-secure-api-key
   ```

2. **Enable and start the MCP server**:
   ```bash
   # Development (with hot reload)
   MCP_ENABLED=true npm run dev -w server

   # Or use the dedicated script
   npm run dev:mcp -w server
   ```

3. **Connect your MCP client** to:
   ```
   http://localhost:3002/mcp
   ```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_ENABLED` | `false` | Enable/disable MCP server |
| `MCP_PORT` | `3002` | Port for MCP server |
| `MCP_HOST` | `0.0.0.0` | Host to bind to |
| `MCP_API_KEY` | (none) | API key for authentication |
| `MCP_SESSION_TTL_MS` | `86400000` | Session TTL (24 hours) |
| `MCP_MAX_SESSIONS` | `100` | Max sessions per API key |
| `MCP_DEBUG` | `false` | Enable debug logging |

## Available Tools

The MCP server exposes 12 tools:

### Page Operations
- **`search_pages`** - Search documentation by query string
- **`get_page`** - Read a specific page's content
- **`create_page`** - Create a new documentation page
- **`update_page`** - Update an existing page
- **`delete_page`** - Delete a page
- **`rename_page`** - Rename a page
- **`move_page`** - Move a page to a different folder

### Folder Operations
- **`list_folders`** - Get folder hierarchy
- **`list_pages`** - List pages in a folder
- **`create_folder`** - Create a new folder
- **`delete_folder`** - Delete an empty folder
- **`rename_folder`** - Rename a folder

## Available Resources

- **`codex://page/{path}`** - Access any documentation page by path
- **`codex://folders`** - Get the complete folder structure as JSON

## Authentication

Set `MCP_API_KEY` to require authentication. Clients must provide the key via:
- `Authorization: Bearer <key>` header, or
- `X-Api-Key: <key>` header

## Connecting with Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "codex": {
      "url": "http://localhost:3002/mcp",
      "headers": {
        "Authorization": "Bearer your-api-key"
      }
    }
  }
}
```

## Connecting with VS Code (GitHub Copilot)

Configure in your VS Code settings or `mcp.json`:

```json
{
  "servers": {
    "codex": {
      "type": "http",
      "url": "http://localhost:3002/mcp",
      "headers": {
        "Authorization": "Bearer your-api-key"
      }
    }
  }
}
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/.well-known/mcp` | GET | Server metadata |
| `/mcp` | POST | MCP JSON-RPC messages |
| `/mcp` | GET | SSE stream for server messages |
| `/mcp` | DELETE | Terminate session |

## Protocol Support

Supports MCP protocol versions:
- `2025-03-26` (latest)
- `2024-11-05`

Uses Streamable HTTP transport for web compatibility.

## Security Considerations

⚠️ **Production Deployment**:
- Always set `MCP_API_KEY` for authentication
- Run behind a reverse proxy with HTTPS
- Use `MCP_HOST=127.0.0.1` to restrict to localhost if not proxying
- Set `MCP_MAX_SESSIONS` appropriately for your use case

## Example: Using from curl

```bash
# Health check
curl http://localhost:3002/health

# Initialize session
# gitleaks:allow
curl -X POST http://localhost:3002/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer your-api-key" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}},"id":1}'

# List tools (use session ID from initialize response)
# gitleaks:allow
curl -X POST http://localhost:3002/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: <session-id>" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":2}'
```
