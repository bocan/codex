# 📝 Disnotion

> A Notion-like wiki and document store built with React and Express.

**Single-user personal knowledge base** - A full-stack TypeScript application that provides a beautiful, intuitive interface for creating and managing markdown documents organized in a hierarchical folder structure.

> ⚠️ **Note**: Disnotion is designed as a **single-user application**. It does not support concurrent multi-user editing or collaboration features. Perfect for personal wikis, note-taking, and documentation.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.2-61dafb)](https://reactjs.org/)
[![Express](https://img.shields.io/badge/Express-4.18-green)](https://expressjs.com/)

## ✨ Features

- 📁 **Folder Management**: Create, delete, and rename folders in a collapsible tree view with right-click context menus
- 📝 **Markdown Pages**: Create and edit markdown documents with GitHub Flavored Markdown support
- 🎨 **Three-Pane Layout**: Folder tree (left), markdown editor (center), live preview (right)
- 📐 **Fully Resizable**: Drag to resize both horizontal panes (left/right) and vertical sections (folder tree/page list)
- 🌓 **Dark Mode**: Auto-detects system theme preference with manual override - cycles through auto/light/dark modes
- 📤 **Move Pages**: Elegant folder picker to move pages between folders via right-click menu
- �💾 **Auto-save**: Content automatically saves after 2 seconds of inactivity
- 🔄 **Live Preview**: See your markdown rendered in real-time with syntax highlighting
- 🌐 **RESTful API**: Programmatic access to all folder and page operations
- ✅ **Tested**: Comprehensive test suite for both backend and frontend
- 🎯 **Collapsible Panes**: Hide sidebars for distraction-free writing
- 🚀 **Fast & Lightweight**: Built with Vite for lightning-fast development
- 🔐 **Password Protection**: Simple password-based authentication to secure your data
- 🛡️ **Security Features**: Rate limiting, request logging, and security headers

## 🔐 Security & Logging

Disnotion includes several security features to protect your data:

### Authentication
- **Password-based login** with bcrypt hashing (10 salt rounds)
- **Session management** using httpOnly cookies (24-hour expiration)
- Authentication can be disabled by not setting `AUTH_PASSWORD` (not recommended for public deployments)

### Rate Limiting
- **Login endpoint** is rate-limited to 5 attempts per 15 minutes per IP address
- Prevents brute force password attacks
- Returns `429 Too Many Requests` when limit is exceeded

### Logging
All login attempts are logged with timestamps and IP addresses:
- `✓ Successful login from 192.168.1.100` - Successful authentication
- `✗ Failed login attempt from 192.168.1.100` - Invalid password
- `Login attempt without password from 192.168.1.100` - Missing password
- `Login attempt when auth disabled from 192.168.1.100` - Auth not configured

HTTP request logging (via morgan):
- **Development**: Concise colored output showing method, URL, status, and response time
- **Production**: Combined Apache-style logs with full details

### Security Headers
Helmet middleware provides:
- Content Security Policy (CSP)
- X-Frame-Options (clickjacking protection)
- X-Content-Type-Options (MIME sniffing protection)
- Strict-Transport-Security (HTTPS enforcement in production)
- And other security headers

### Best Practices
- Always set a strong `AUTH_PASSWORD` for deployments
- Use a unique `SESSION_SECRET` in production
- Enable HTTPS in production (`NODE_ENV=production`)
- Monitor logs for suspicious login patterns
- Consider deploying behind a reverse proxy (nginx, Caddy) for additional security

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/bocan/disnotion.git
cd disnotion

# Install dependencies
make install
```

### Configuration

Create a `.env` file in the root directory:

```env
# Required: Set your password
AUTH_PASSWORD=your-secure-password-here

# Optional: Server port (default: 3001)
PORT=3001
```

### Running

```bash
# Start both server and client
make dev

# Visit http://localhost:3000
# Login with your AUTH_PASSWORD
```

## 🛠️ Development

### Project Scripts

```bash
# Development
make dev              # Run both server and client
make dev-server       # Run server only (port 3001)
make dev-client       # Run client only (port 3000)

# Building
make build            # Build both server and client
make build-server     # Build server only
make build-client     # Build client only

# Testing
make test             # Run all tests
make test-server      # Run backend tests
make test-client      # Run frontend tests

# Maintenance
make clean            # Remove all node_modules and build artifacts
make install          # Fresh install of all dependencies
make help             # Show all available commands
```

### Development Workflow

1. Make your changes in the appropriate files
2. Tests run automatically in watch mode (if enabled)
3. Server auto-reloads on file changes (via ts-node-dev)
4. Client hot-reloads on file changes (via Vite HMR)
5. Run `make test` before committing

### Adding New Features

#### Backend (Adding a new API endpoint)

1. Create controller in `server/src/controllers/`
2. Add route in `server/src/routes/`
3. Register route in `server/src/index.ts`
4. Add tests in `server/tests/`

#### Frontend (Adding a new component)

1. Create component in `client/src/components/`
2. Add corresponding CSS file
3. Import and use in parent component
4. Add tests in same directory (`.test.tsx`)

## 🏗️ Project Structure

```
disnotion/
├── 📄 Makefile                    # Build automation
├── 📄 package.json                # Root package config
├── 📄 README.md                   # This file
│
├── 📁 server/                     # Backend (Express + TypeScript)
│   ├── 📄 package.json            # Server dependencies
│   ├── 📄 tsconfig.json           # TypeScript config
│   ├── 📄 jest.config.js          # Test configuration
│   ├── 📁 src/
│   │   ├── 📄 index.ts            # Server entry point
│   │   ├── 📁 controllers/        # Request handlers
│   │   │   ├── folderController.ts
│   │   │   └── pageController.ts
│   │   ├── 📁 routes/             # API routes
│   │   │   ├── folders.ts
│   │   │   └── pages.ts
│   │   └── 📁 services/           # Business logic
│   │       └── fileSystem.ts      # File operations
│   └── 📁 tests/                  # Test files
│       └── api.test.ts
│
├── 📁 client/                     # Frontend (React + TypeScript)
│   ├── 📄 package.json            # Client dependencies
│   ├── 📄 tsconfig.json           # TypeScript config
│   ├── 📄 vite.config.ts          # Vite configuration
│   ├── 📄 vitest.config.ts        # Test configuration
│   ├── 📄 index.html              # HTML entry point
│   ├── 📁 src/
│   │   ├── 📄 main.tsx            # React entry point
│   │   ├── 📄 App.tsx             # Main app component
│   │   ├── 📄 App.css             # App styles
│   │   ├── 📁 components/         # React components
│   │   │   ├── FolderTree.tsx     # Folder navigation
│   │   │   ├── FolderTree.css
│   │   │   ├── PageList.tsx       # Page list in folder
│   │   │   ├── PageList.css
│   │   │   ├── Editor.tsx         # Markdown editor
│   │   │   ├── Editor.css
│   │   │   ├── Preview.tsx        # Markdown preview
│   │   │   ├── Preview.css
│   │   │   └── *.test.tsx         # Component tests
│   │   ├── 📁 services/           # API client
│   │   │   └── api.ts
│   │   ├── 📁 types/              # TypeScript types
│   │   │   └── index.ts
│   │   └── 📁 test/               # Test setup
│   │       └── setup.ts
│
└── 📁 data/                       # File storage
    └── Welcome.md                 # Default welcome page
```

## 📋 Table of Contents

- [Quick Start](#-quick-start)
- [Installation](#-installation)
- [Usage](#-usage)
- [Project Structure](#-project-structure)
- [API Documentation](#-api-documentation)
- [Testing](#-testing)
- [Development](#-development)
- [Tech Stack](#-tech-stack)
- [Makefile Commands](#-makefile-commands)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)

## 🚀 Quick Start

The fastest way to get started using the Makefile:

```bash
# Install all dependencies
make install

# Run the application
make dev
```

Then open [http://localhost:3000](http://localhost:3000) in your browser!

## 📦 Installation

### Prerequisites

- Node.js 18+ and npm
- macOS, Linux, or Windows with WSL

### Option 1: Using Make (Recommended)

```bash
make install
```

### Option 2: Using npm

```bash
npm run install:all
```

### Option 3: Manual Installation

```bash
# Install root dependencies
npm install

# Install server dependencies
cd server && npm install

# Install client dependencies
cd ../client && npm install
```

## 🎯 Usage

### Running the Application

#### Option 1: Using Make (Recommended)

```bash
# Run both server and client in development mode
make dev

# Or run them separately
make dev-server    # Runs server on port 3001
make dev-client    # Runs client on port 3000
```

#### Option 2: Using npm

```bash
# Run both concurrently
npm run dev

# Or run separately
npm run dev:server
npm run dev:client
```

The application will be available at:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **API Health Check**: http://localhost:3001/api/health

### Using the Web Interface

1. **Navigate Folders**: Click on folders in the left pane to select them
2. **Create Folders**: Right-click any folder and select "New Folder"
3. **Create Pages**: Select a folder and click "+ New Page"
4. **Edit Content**: Click on a page to open it in the editor (center pane)
5. **Rename Page**: Right-click on a page and select "Rename"
6. **Move Page**: Right-click on a page and select "Move to..." to move it to another folder
7. **Delete Page**: Right-click on a page and select "Delete"
8. **Preview**: See live markdown preview in the right pane
9. **Auto-save**: Content saves automatically after 2 seconds
10. **Resize Panes**:
    - Drag the edge of left/right panes to resize horizontally
    - Drag the divider between folder tree and page list to resize vertically
11. **Collapse Panes**: Use the arrow buttons to hide left/right panes
12. **Theme Toggle**: Click the theme button (🌓/☀️/🌙) in the header to cycle through auto/light/dark modes

### Production Build

```bash
# Using Make
make build

# Using npm
npm run build
```

This creates optimized production builds in:
- `server/dist/` - Compiled backend
- `client/dist/` - Optimized frontend bundle

## 📡 API Documentation

The REST API is available at `http://localhost:3001/api`

### Health Check

```bash
GET /api/health
```

**Response:**
```json
{
  "status": "ok"
}
```

### Folder Endpoints

#### Get Folder Tree

```bash
GET /api/folders
```

**Response:**
```json
{
  "name": "root",
  "path": "/",
  "type": "folder",
  "children": [
    {
      "name": "Projects",
      "path": "Projects",
      "type": "folder",
      "children": []
    }
  ]
}
```

#### Create Folder

```bash
POST /api/folders
Content-Type: application/json

{
  "path": "folder-name"
}
# or nested: "parent/subfolder"
```

**Example:**
```bash
curl -X POST http://localhost:3001/api/folders \
  -H "Content-Type: application/json" \
  -d '{"path": "My Notes"}'
```

#### Delete Folder

```bash
DELETE /api/folders/:path
```

**Example:**
```bash
curl -X DELETE http://localhost:3001/api/folders/My%20Notes
```

#### Rename Folder

```bash
PUT /api/folders/rename
Content-Type: application/json

{
  "oldPath": "old-name",
  "newPath": "new-name"
}
```

**Example:**
```bash
curl -X PUT http://localhost:3001/api/folders/rename \
  -H "Content-Type: application/json" \
  -d '{"oldPath": "My Notes", "newPath": "Work Notes"}'
```

### Page Endpoints

#### List Pages in Folder

```bash
GET /api/pages?folder=folder-path
```

**Response:**
```json
[
  {
    "name": "page1.md",
    "path": "folder/page1.md",
    "type": "file"
  }
]
```

#### Get Page Content

```bash
GET /api/pages/:path
```

**Response:**
```json
{
  "path": "folder/page1.md",
  "content": "# Page Title\n\nContent here..."
}
```

**Example:**
```bash
curl http://localhost:3001/api/pages/My%20Notes/hello.md
```

#### Create Page

```bash
POST /api/pages
Content-Type: application/json

{
  "path": "folder/page.md",
  "content": "# Page Title\n\nContent here..."
}
```

**Example:**
```bash
curl -X POST http://localhost:3001/api/pages \
  -H "Content-Type: application/json" \
  -d '{"path": "My Notes/hello.md", "content": "# Hello World\n\nThis is my first page!"}'
```

#### Update Page

```bash
PUT /api/pages/:path
Content-Type: application/json

{
  "content": "# Updated Content"
}
```

**Example:**
```bash
curl -X PUT http://localhost:3001/api/pages/My%20Notes/hello.md \
  -H "Content-Type: application/json" \
  -d '{"content": "# Updated Hello\n\nNew content!"}'
```

#### Delete Page

```bash
DELETE /api/pages/:path
```

**Example:**
```bash
curl -X DELETE http://localhost:3001/api/pages/My%20Notes/hello.md
```

#### Rename Page

```bash
PUT /api/pages/rename/file
Content-Type: application/json

{
  "oldPath": "old-page.md",
  "newPath": "new-page.md"
}
```

**Example:**
```bash
curl -X PUT http://localhost:3001/api/pages/rename/file \
  -H "Content-Type: application/json" \
  -d '{"oldPath": "My Notes/hello.md", "newPath": "My Notes/welcome.md"}'
```

#### Move Page

```bash
PUT /api/pages/move
Content-Type: application/json

{
  "oldPath": "folder1/page.md",
  "newFolderPath": "folder2"
}
# Returns: { "success": true, "newPath": "folder2/page.md" }
```

**Example:**
```bash
curl -X PUT http://localhost:3001/api/pages/move \
  -H "Content-Type: application/json" \
  -d '{"oldPath": "My Notes/hello.md", "newFolderPath": "Projects"}'
```

## 🧪 Testing

### Run All Tests

```bash
# Using Make
make test

# Using npm
npm test
```

### Run Tests for Specific Component

```bash
# Backend tests only
make test-server
# or: cd server && npm test

# Frontend tests only
make test-client
# or: cd client && npm test

# Frontend tests with UI
cd client && npm run test:ui

# Backend tests in watch mode
cd server && npm run test:watch
```

### Test Coverage

The project includes tests for:
- ✅ All API endpoints (folders and pages)
- ✅ File system operations
- ✅ React components (FolderTree, Editor, Preview)
- ✅ Error handling and edge cases

## 🔧 Troubleshooting

### Common Issues

#### Port Already in Use

If you see "Port 3000 or 3001 already in use":

```bash
# Find and kill process on port 3001
lsof -ti:3001 | xargs kill -9

# Find and kill process on port 3000
lsof -ti:3000 | xargs kill -9
```

#### Dependencies Not Installing

```bash
# Clean everything and reinstall
make clean
make install

# Or manually
rm -rf node_modules server/node_modules client/node_modules
npm install
cd server && npm install
cd ../client && npm install
```

#### TypeScript Errors

```bash
# Rebuild TypeScript projects
cd server && npm run build
cd ../client && npm run build
```

#### Tests Failing

```bash
# Make sure dependencies are installed
make install

# Run tests with verbose output
cd server && npm test -- --verbose
cd client && npm test -- --verbose
```

#### Data Directory Issues

The `data/` directory is created automatically. If you encounter permission issues:

```bash
# Make sure the data directory is writable
chmod 755 data/
```

### Getting Help

- Check the [GitHub Issues](https://github.com/yourusername/disnotion/issues)
- Review the API documentation above
- Ensure all prerequisites are installed
- Try a clean install: `make clean && make install`

## 💻 Tech Stack

### Backend
- **[Express](https://expressjs.com/)** `^4.18.2` - Fast, unopinionated web framework
- **[TypeScript](https://www.typescriptlang.org/)** `^5.3.3` - Type-safe JavaScript
- **[CORS](https://www.npmjs.com/package/cors)** `^2.8.5` - Cross-origin resource sharing
- **[ts-node-dev](https://www.npmjs.com/package/ts-node-dev)** `^2.0.0` - Development server with auto-reload

**Testing:**
- **[Jest](https://jestjs.io/)** `^29.7.0` - Testing framework
- **[Supertest](https://www.npmjs.com/package/supertest)** `^6.3.3` - HTTP assertion library
- **[ts-jest](https://www.npmjs.com/package/ts-jest)** `^29.1.1` - TypeScript preprocessor for Jest

### Frontend
- **[React](https://reactjs.org/)** `^18.2.0` - UI library
- **[TypeScript](https://www.typescriptlang.org/)** `^5.3.3` - Type-safe JavaScript
- **[Vite](https://vitejs.dev/)** `^5.0.11` - Next-generation frontend tooling
- **[React Markdown](https://www.npmjs.com/package/react-markdown)** `^9.0.1` - Markdown renderer
- **[remark-gfm](https://www.npmjs.com/package/remark-gfm)** `^4.0.0` - GitHub Flavored Markdown
- **[Axios](https://axios-http.com/)** `^1.6.5` - HTTP client

**Testing:**
- **[Vitest](https://vitest.dev/)** `^1.1.3` - Unit test framework
- **[Testing Library](https://testing-library.com/)** - React testing utilities
- **[jsdom](https://www.npmjs.com/package/jsdom)** `^23.2.0` - DOM implementation

### Development Tools
- **[Concurrently](https://www.npmjs.com/package/concurrently)** `^8.2.2` - Run multiple commands
- **ESLint** - Code linting
- **Prettier** - Code formatting (optional)

## 🎮 Makefile Commands

All available Make commands:

```bash
make help           # Show all available commands
make install        # Install all dependencies
make dev            # Run both server and client in dev mode
make dev-server     # Run server only
make dev-client     # Run client only
make build          # Build both server and client
make build-server   # Build server only
make build-client   # Build client only
make test           # Run all tests
make test-server    # Run server tests
make test-client    # Run client tests
make clean          # Remove node_modules and build artifacts
make clean-server   # Clean server only
make clean-client   # Clean client only
```

### Makefile Quick Reference

```makefile
# Quick start
make install && make dev

# Clean slate
make clean && make install && make test

# Production build
make clean && make install && make build
```

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`make test`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Code Style

- Use TypeScript for all new code
- Follow existing code formatting
- Add tests for new features
- Update documentation as needed

## 📄 License

MIT

## 🙏 Acknowledgments

- Built with [React](https://reactjs.org/) and [Express](https://expressjs.com/)
- Markdown rendering by [react-markdown](https://github.com/remarkjs/react-markdown)
- Icons from Unicode emoji

---

**Made with ❤️ for taking better notes**
