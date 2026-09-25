# Imagem do app para a VPS. Build em duas etapas: instala e compila, depois
# roda só o necessário com usuário sem privilégios.

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build && pnpm prune --prod

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/package.json ./
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/.next ./.next
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/next.config.ts ./
COPY --from=build --chown=app:app /app/drizzle ./drizzle
COPY --from=build --chown=app:app /app/db/migrar.mjs ./db/migrar.mjs
COPY --from=build --chown=app:app /app/db/operacao-dono.mjs ./db/operacao-dono.mjs
USER app
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
