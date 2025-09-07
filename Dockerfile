# Stage 1: Build stage
FROM node:22-alpine AS builder

# Install build dependencies and enable pnpm
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    openssl && \
    corepack enable

# Set working directory
WORKDIR /app

# Copy pnpm files first (for better layer caching)
COPY package.json pnpm-lock.yaml ./

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the TypeScript application
RUN pnpm run build

# Prune dev dependencies and clean cache
RUN pnpm prune --prod && pnpm store prune

# Stage 2: Production runtime
FROM node:22-alpine AS production

# Install runtime dependencies and enable pnpm
RUN apk add --no-cache \
    openssl \
    dumb-init \
    curl && \
    corepack enable

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S reverseproxy -u 1001

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=reverseproxy:nodejs /app/dist ./dist
COPY --from=builder --chown=reverseproxy:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=reverseproxy:nodejs /app/package.json ./
COPY --from=builder --chown=reverseproxy:nodejs /app/pnpm-lock.yaml ./

# Copy configuration files
COPY --chown=reverseproxy:nodejs config.yaml ./
COPY --chown=reverseproxy:nodejs mock-server-config.yaml ./

# Create SSL certificates directory
RUN mkdir -p /app/certs && \
    chown -R reverseproxy:nodejs /app/certs

# Create logs directory for better observability
RUN mkdir -p /app/logs && \
    chown -R reverseproxy:nodejs /app/logs

# Switch to non-root user
USER reverseproxy

# Expose ports
EXPOSE 8080 8443

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js", "--config", "config.yaml"]
