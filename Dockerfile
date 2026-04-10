FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY backend/package*.json backend/
COPY frontend/package*.json frontend/

RUN npm install
RUN npm run install:all

# Copy the rest of the repo so build steps have access to sources, configs, and the new entrypoint.
COPY . .

RUN npm run build:frontend
RUN cd backend && npm run build

EXPOSE 3001

CMD ["node", "backend/server.js"]
