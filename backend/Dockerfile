# Use Debian slim image to avoid compiling native dependencies from source
FROM node:24-bookworm-slim

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build the TypeScript project
RUN npm run build

# Download and exercise the model during the build, so cold uploads need no model download.
RUN npm run prepare:embeddings

# Expose the API port
EXPOSE 3001

# Start the server using the compiled JavaScript
CMD ["npm", "start"]
