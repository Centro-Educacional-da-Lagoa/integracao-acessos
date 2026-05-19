FROM node:21-alpine

RUN apk add --no-cache openssl

WORKDIR /usr/src/app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/backend/prisma/schema.prisma apps/backend/prisma/schema.prisma

RUN npm install -g pnpm

COPY . .

RUN pnpm install

RUN pnpm --filter backend exec prisma generate --schema=prisma/schema.prisma

RUN pnpm --filter backend build

EXPOSE 3000

CMD ["node", "apps/backend/dist/main.js"]
