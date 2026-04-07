FROM node:20-alpine
WORKDIR /app

# Copy package files first (better layer caching)
COPY package.json package-lock.json* tsconfig.json ./

# Install ALL deps (including tsc) for the build step
RUN npm install --no-audit --no-fund

# Copy source + signatures
COPY src ./src

# Compile TypeScript to dist
RUN npx tsc

# Bring the YAML signatures into dist so the runtime can load them
RUN cp -r src/signatures dist/signatures

# Strip dev dependencies for a leaner runtime image
RUN npm prune --omit=dev

# Main service port (CHECKSUM)
EXPOSE 8898

# Run the compiled output
CMD ["node", "dist/index.js"]
