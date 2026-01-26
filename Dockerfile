# Multi-stage Dockerfile for Codex
# Stage 1: Build
FROM node:24-alpine AS builder

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
FROM node:24-alpine AS production

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

# Create data directory and set permissions
RUN mkdir -p /app/data && chown -R codex:codex /app

# Switch to non-root user
USER codex

# Expose server port
EXPOSE 3001

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api || exit 1

# Start the server (serves both API and static client files)
CMD ["node", "server/dist/index.js"]
