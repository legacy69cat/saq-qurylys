FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN mkdir -p /var/lib/saq /var/backups/saq && chown -R node:node /var/lib/saq /var/backups/saq
ENV NODE_ENV=production APP_ENV=production SAQ_AUTH_MODE=session DATABASE_PATH=/var/lib/saq/saq.sqlite BACKUP_DIR=/var/backups/saq
USER node
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0"]
