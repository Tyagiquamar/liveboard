FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
# Production deps only + tsx (runs TS directly); skips heavy dev deps
# (vitest, mongodb-memory-server w/ mongod binary) to keep the image small.
RUN npm install --omit=dev --no-audit --no-fund && npm install --no-save tsx && npm cache clean --force
# Copy only the runtime source (see .dockerignore).
COPY src ./src
COPY tsconfig.json ./
ENV NODE_ENV=production
EXPOSE 4000
CMD ["npx", "tsx", "src/main.ts"]
