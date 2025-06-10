# Build-Stage
FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Umgebungsvariablen für Vite verfügbar machen
ARG VITE_WHISPER_API_DOMAIN
ENV VITE_WHISPER_API_DOMAIN=${VITE_WHISPER_API_DOMAIN}
RUN npm run build

# Production-Stage
FROM node:18-alpine
WORKDIR /app
# Simpler Webserver installieren
RUN npm install -g serve
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]