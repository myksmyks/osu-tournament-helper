FROM node:20-alpine

# Install build tools (needed for sqlite3 compilation)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files first to leverage Docker cache
COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

CMD ["node", "src/index.js"]
