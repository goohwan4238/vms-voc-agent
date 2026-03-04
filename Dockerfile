FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Dashboard build ---
FROM node:20-alpine AS dashboard-builder

WORKDIR /app/dashboard

COPY dashboard/package*.json ./
RUN npm ci

COPY dashboard/ .
RUN npm run build

# --- Production ---
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist
COPY --from=dashboard-builder /app/dashboard/dist ./dashboard/dist

USER node

EXPOSE 3000

CMD ["node", "dist/index.js", "all"]
