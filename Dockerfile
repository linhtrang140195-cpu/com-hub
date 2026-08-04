# Stage 1: Build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY src ./src
COPY public ./public
COPY index.html vite.config.js ./
RUN npm run build

# Stage 2: Backend (serves built frontend + API)
FROM node:20-alpine
WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./
RUN npm install --omit=dev
COPY backend/src ./src
COPY --from=frontend-build /app/dist ./public
ENV PORT=4000
EXPOSE 4000
CMD ["node", "src/index.js"]
