# Multi-stage Dockerfile for Codex
# Stage 1: Build
FROM node:25-alpine AS builder

WORKDIR /app

# Copy package files for dependency installation
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/

# Install all dependencies (including devDependencies for building)
RUN npm ci

# Copy source code
COPY server/ ./server/
COPY client/ ./client/

# Build both server and client
RUN npm run build

# Stage 2: Production
FROM node:25-alpine AS production

WORKDIR /app

# Install git for version history features
RUN apk add --no-cache git

# Create non-root user for security
RUN addgroup -g 1001 -S codex && \
  adduser -S codex -u 1001 -G codex

# Copy package files
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/

# Install only production dependencies
RUN npm ci --omit=dev

# Copy built artifacts from builder stage
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist

# Include default templates in the image for first-run seeding into the mounted data volume
COPY data/templates ./seed/templates

# Include built-in documentation that should always be synced into the mounted data volume
COPY ["data/Codex Documentation/README.md", "./seed/docs/Codex Documentation/README.md"]

# Create data directory and set permissions
RUN mkdir -p /app/data && chown -R codex:codex /app

# Switch to non-root user
USER codex

# Expose server port
EXPOSE 3001

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001
ENV DATA_DIR=/app/data

# Seed templates into the data volume on first run (only if data/templates is missing or empty)
ENV CODEX_SEED_TEMPLATES=true
ENV CODEX_SEED_TEMPLATES_DIR=/app/seed/templates

# Always sync built-in documentation README into the data volume on startup
ENV CODEX_SYNC_BUILTIN_DOCS=true
ENV CODEX_SYNC_BUILTIN_DOCS_DIR=/app/seed/docs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api || exit 1

# Start the server (serves both API and static client files)
CMD ["node", "server/dist/index.js"]
