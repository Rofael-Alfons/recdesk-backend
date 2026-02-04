# Build stage - using SWC for fast, memory-efficient compilation
FROM node:20-alpine AS builder

# Install build dependencies for native modules (bcrypt, etc.)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./
COPY prisma ./prisma/
COPY .swcrc ./
COPY nest-cli.json ./
COPY tsconfig*.json ./

# Install all dependencies (including dev for build)
# Using npm install instead of npm ci for better compatibility
RUN npm install --legacy-peer-deps

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY src ./src

# Build using SWC (much faster and uses ~10x less memory than tsc)
# SWC is written in Rust and doesn't suffer from Node.js heap limits
# Fallback: NODE_OPTIONS for any Node.js processes during build
ENV NODE_OPTIONS="--max-old-space-size=8192"
RUN npm run build

# Remove dev dependencies after build
RUN npm prune --omit=dev

# Production stage - minimal image
FROM node:20-alpine AS production

WORKDIR /app

# Copy only necessary files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

# Set production environment
ENV NODE_ENV=production

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "dist/main"]
