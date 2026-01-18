# Customer Debt Video AI - Frontend

React-based frontend application for the Customer Debt Video AI Analysis platform.

## 🚀 Quick Start

### Prerequisites

- Node.js (version specified in `.nvmrc`)
- npm or yarn
- nvm (recommended for Node version management)

### Installation

```bash
# Use the correct Node.js version
nvm use

# Install dependencies
npm install

# Start development server
npm run dev
```

The application will be available at `http://localhost:5000`.

## 📦 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build for development/sandbox environment |
| `npm run build:staging` | Build for staging environment |
| `npm run build:production` | Build for production environment |
| `npm run preview` | Preview production build locally |
| `npm run check` | Run TypeScript type checking |


## 🔧 Configuration

### Environment Variables

The application uses Vite environment variables for configuration. See [docs/ENVIRONMENT_CONFIG.md](docs/ENVIRONMENT_CONFIG.md) for detailed information.

Key variables:
- `VITE_USE_MOCK` - Enable/disable mock data
- `VITE_API_BASE_URL` - API endpoint URL (empty for relative URLs)

### Node.js Version

The project uses the Node.js version specified in `.nvmrc`. To switch to the correct version:

```bash
nvm use
```

## 🚢 Deployment

The application uses automated CI/CD deployment via GitHub Actions. See [docs/RELEASE.md](docs/RELEASE.md) for detailed deployment procedures.

### Branch → Environment Mapping

- `main` → Production
- `test` → Staging
- `dev` → Sandbox
- `{name}/dev` → Developer namespace

## 🧪 Testing

```bash
# Run TypeScript checks
npm run check

# Build to verify no errors
npm run build
```

## 📚 Documentation

- [Environment Configuration](docs/ENVIRONMENT_CONFIG.md) - Environment setup and variables
- [Release Guide](docs/RELEASE.md) - Deployment and release procedures
