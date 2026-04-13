FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@10.8.1 --activate
WORKDIR /app

# Install dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY vendor/ vendor/
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm run build

# Production
FROM node:22-slim AS runner
RUN corepack enable && corepack prepare pnpm@10.8.1 --activate
WORKDIR /app
COPY --from=base /app .

ENV NODE_ENV=production
ENV API_PORT=9990
EXPOSE 9990

CMD ["node", "apps/api/dist/src/server/index.js"]
