FROM node:22-slim
RUN corepack enable && corepack prepare pnpm@10.8.1 --activate
WORKDIR /app

# Copy everything
COPY . .

# Install deps
RUN pnpm install --frozen-lockfile

# Build only the shared package (needed by both api and web) and the web app.
# The API runs via tsx at runtime — no tsc compilation needed.
RUN pnpm --filter @calypso/shared run build
RUN pnpm --filter @calypso/web run build

# Install tsx globally for the API runtime
RUN npm install -g tsx

ENV NODE_ENV=production
ENV API_PORT=9990
EXPOSE 9990 3000

# Run the API with tsx (same as dev mode, handles TypeScript directly)
CMD ["tsx", "apps/api/src/server/index.ts"]
