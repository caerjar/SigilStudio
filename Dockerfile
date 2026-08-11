# Dev/build image for the Vite frontend. Pure client-side app — no runtime
# backend. Bind to 0.0.0.0 inside the container via `vite --host`.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm install
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev"]
