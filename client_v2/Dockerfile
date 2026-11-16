# ---------- Build stage ----------
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency files
COPY package*.json ./

# Install deps (no dev cache in final image)
RUN npm i

# Copy source
COPY . .

# Build Vite/React app
RUN npm run build


# ---------- Run stage (no app node_modules) ----------
FROM node:22-alpine AS runner

WORKDIR /app

# Install a tiny static file server globally
RUN npm install -g serve

# Copy only built assets from builder
COPY --from=builder /app/dist ./dist

# Expose port 5173
EXPOSE 5173

# Serve the built app on port 5173
CMD ["serve", "-s", "dist", "-l", "5173"]