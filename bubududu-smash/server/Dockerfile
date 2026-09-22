# The game server needs the RULES too — js/sim.js and everything it imports —
# because it runs the same files the browser does rather than a second copy.
FROM node:20-slim
WORKDIR /app

COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install --omit=dev --no-audit --no-fund

# The shared simulation, beside the server, at the relative path it expects.
COPY js/ ./js/
COPY server/ ./server/

WORKDIR /app/server
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "index.mjs"]
