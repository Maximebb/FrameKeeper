# FrameKeeper server image (client runs natively on Windows, not in Docker).
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/frontend/package.json packages/frontend/
RUN npm ci -w @framekeeper/shared -w @framekeeper/server -w @framekeeper/frontend --include-workspace-root=false
COPY tsconfig.base.json ./
COPY packages ./packages
RUN npm run build -w @framekeeper/shared \
 && npm run build -w @framekeeper/server \
 && npm run build -w @framekeeper/frontend

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
RUN npm ci --omit=dev -w @framekeeper/shared -w @framekeeper/server --include-workspace-root=false \
 || npm install --omit=dev -w @framekeeper/shared -w @framekeeper/server
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/server/dist packages/server/dist
COPY --from=build /app/packages/frontend/dist packages/frontend/dist

ENV PORT=8080 \
    FK_DATA_DIR=/data \
    FK_BACKUP_DIR=/backups \
    FK_FRONTEND_DIR=/app/packages/frontend/dist
VOLUME ["/data", "/backups"]
EXPOSE 8080
CMD ["node", "packages/server/dist/index.js"]
