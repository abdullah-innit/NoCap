FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.js ./
COPY domain.js ./
COPY leagues.js ./
COPY fixtures.js ./
COPY security.js ./
COPY roster.js ./
COPY offline.js ./
COPY *.test.js ./
EXPOSE 8080
CMD ["node", "server.js"]
