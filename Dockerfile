FROM node:22-slim
RUN corepack enable && corepack prepare pnpm@10.8.1 --activate
WORKDIR /app

COPY . .

# node-linker=hoisted in .npmrc forces flat node_modules (no symlinks)
RUN pnpm install --frozen-lockfile

# Build shared + web. API runs via tsx at runtime.
RUN pnpm --filter @calypso/shared run build
RUN pnpm --filter @calypso/web run build

RUN npm install -g tsx

ENV NODE_ENV=production
ENV API_PORT=9990
EXPOSE 9990 3000

CMD ["tsx", "apps/api/src/server/index.ts"]
