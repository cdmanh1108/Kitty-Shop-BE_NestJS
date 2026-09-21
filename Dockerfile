FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN DATABASE_URL='postgresql://build:build@localhost:5432/build?schema=public' npm exec -- prisma generate \
  && npm run build

FROM build AS production-deps
RUN npm prune --omit=dev

# This target intentionally retains the Prisma CLI and migrations. Build and
# publish it as a separate image, then run `prisma migrate deploy` as a one-off
# deployment job before replacing the API container.
FROM node:22-alpine AS migrator
WORKDIR /app
ENV NODE_ENV=production
COPY --chown=node:node package*.json ./
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node --from=build /app/node_modules ./node_modules
USER node
CMD ["./node_modules/.bin/prisma", "migrate", "deploy"]

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --chown=node:node package*.json ./
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node --from=production-deps /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/src/main.js"]
