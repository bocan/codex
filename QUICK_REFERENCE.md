# Codex Quick Reference

## Quick Start
```bash
make install    # Install dependencies
make dev        # Start development servers
```

## Common Commands
| Command | Description |
|---------|-------------|
| `make help` | Show all commands |
| `make install` | Install all dependencies |
| `make dev` | Run both server and client |
| `make test` | Run all tests |
| `make build` | Build for production |
| `make clean` | Remove all node_modules and builds |

## Development
```bash
make dev-server       # Server only (port 3001)
make dev-client       # Client only (port 3000)
make test-server      # Backend tests
make test-client      # Frontend tests
```

## Utilities
```bash
make status           # Show project status
make ports            # Check if ports are in use
make kill-ports       # Free up ports 3000/3001
make fresh            # Clean install + test
```

## API Endpoints

### Folders
- `GET /api/folders` - Get folder tree
- `POST /api/folders` - Create folder
- `DELETE /api/folders/:path` - Delete folder
- `PUT /api/folders/rename` - Rename folder

### Pages
- `GET /api/pages?folder=path` - List pages
- `GET /api/pages/:path` - Get page content
- `POST /api/pages` - Create page
- `PUT /api/pages/:path` - Update page
- `DELETE /api/pages/:path` - Delete page
- `PUT /api/pages/rename/file` - Rename page
- `PUT /api/pages/move` - Move page to different folder

## UI Features

### Page Operations
- **Create**: Select folder → "+ New Page"
- **Edit**: Click page to open in editor
- **Rename**: Right-click page → "Rename"
- **Move**: Right-click page → "Move to..." → Select destination
- **Delete**: Right-click page → "Delete"

### Theme Toggle
- Click theme icon in header (🌓/☀️/🌙)
- Cycles: Auto → Light → Dark
- Auto mode follows system preference
- Choice saved in browser

### Resizing
- **Horizontal**: Drag left/right pane edges
- **Vertical**: Drag divider between folder tree and page list
- All sizes saved in browser

## Keyboard Shortcuts (in app)
- Right-click folder → Folder context menu (New, Rename, Delete)
- Right-click page → Page context menu (Rename, Delete)
- Auto-save after 2 seconds
- Drag pane edges to resize (sizes saved in browser)
- Collapse panes with arrow buttons

## URLs
- Frontend: http://localhost:3000
- API: http://localhost:3001
- Health: http://localhost:3001/api/health
