FROM node:20-alpine

# Instalacja zależności systemowych potrzebnych do kompilacji better-sqlite3 i działania binariów
RUN apk add --no-cache python3 make g++ libc6-compat

WORKDIR /app

# Kopiujemy pliki zależności (wykorzystanie cache Dockera)
COPY package*.json ./

# Instalacja zależności (w tym kompilacja better-sqlite3)
RUN npm install --production

# Kopiujemy resztę kodu aplikacji
COPY . .

# Przygotowanie katalogu na bazę danych i ustawienie uprawnień
RUN mkdir -p /app/data && chown -R node:node /app

# Przełączamy się na nieuprzywilejowanego użytkownika
USER node

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/worklog.db

EXPOSE 3000

# Healthcheck sprawdzający czy serwer odpowiada (używamy wbudowanego fetch w Node 20)
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s \
  CMD node -e "fetch('http://localhost:3000/').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
