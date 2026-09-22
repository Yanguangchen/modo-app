# Cloud Run image for the Clarity API. Build context: backend/.
FROM node:22-slim AS build
WORKDIR /app/backend
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app/backend
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/backend/dist ./dist
COPY prompts ./prompts
USER node
# Cloud Run sets PORT. Credentials come from the runtime service account; no key file is baked in.
CMD ["node", "dist/server.js"]
