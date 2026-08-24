FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY . .
ENV NODE_ENV=production
EXPOSE 4000
CMD ["npx", "tsx", "src/main.ts"]
