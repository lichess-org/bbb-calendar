FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS install
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM base
COPY --from=install /app/node_modules ./node_modules
COPY . .

ARG COMMIT_SHA=dev
ENV NODE_ENV=production
ENV COMMIT_SHA=${COMMIT_SHA}
EXPOSE 3000

CMD ["bun", "index.ts"]
