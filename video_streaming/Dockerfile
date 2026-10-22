# Build image
FROM node:22-slim AS build

RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run build

# Final image
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./

RUN npm ci --omit=dev
COPY --from=build /app/ ./

USER node

EXPOSE 3000

CMD ["npm", "start"]