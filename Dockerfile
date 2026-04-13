FROM node:22-slim
RUN corepack enable && corepack prepare pnpm@10.8.1 --activate
WORKDIR /app

# Copy everything
COPY . .

# Install deps
RUN pnpm install --frozen-lockfile

# pnpm creates symlinks for workspace packages. Node ESM can't resolve
# through symlinks reliably, so replace them with actual copies.
RUN for pkg in hoops-sdk-types hoops-sdk-core hoops-sdk-actions; do \
      target=$(readlink -f /app/node_modules/$pkg 2>/dev/null || echo ""); \
      if [ -L "/app/node_modules/$pkg" ] && [ -n "$target" ]; then \
        rm /app/node_modules/$pkg && cp -r $target /app/node_modules/$pkg; \
      fi; \
      target=$(readlink -f /app/apps/api/node_modules/$pkg 2>/dev/null || echo ""); \
      if [ -L "/app/apps/api/node_modules/$pkg" ] && [ -n "$target" ]; then \
        rm /app/apps/api/node_modules/$pkg && cp -r $target /app/apps/api/node_modules/$pkg; \
      fi; \
    done

# Build shared package + web app. API runs via tsx (no tsc needed).
RUN pnpm --filter @calypso/shared run build
RUN pnpm --filter @calypso/web run build

# Install tsx for API runtime
RUN npm install -g tsx

ENV NODE_ENV=production
ENV API_PORT=9990
EXPOSE 9990 3000

CMD ["tsx", "apps/api/src/server/index.ts"]
