# Build context: monorepo root (proyect/)
FROM node:22-alpine AS builder
WORKDIR /workspace

ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_WS_URL=ws://localhost:5000
ARG NEXT_PUBLIC_E2EE_DEV_FALLBACK=false

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_E2EE_DEV_FALLBACK=$NEXT_PUBLIC_E2EE_DEV_FALLBACK
ENV NEXT_TELEMETRY_DISABLED=1

# contracts
COPY Signalix-contracts/package*.json ./Signalix-contracts/
RUN cd Signalix-contracts && npm ci
COPY Signalix-contracts/ ./Signalix-contracts/
RUN cd Signalix-contracts && npm run build

# frontend
COPY Signalix-frontend/package*.json ./Signalix-frontend/
RUN cd Signalix-frontend && npm ci

# Materialize file: symlink before build
RUN rm -f /workspace/Signalix-frontend/node_modules/@signalix/contracts \
 && mkdir -p /workspace/Signalix-frontend/node_modules/@signalix/contracts \
 && cp /workspace/Signalix-contracts/package.json \
       /workspace/Signalix-frontend/node_modules/@signalix/contracts/ \
 && cp -r /workspace/Signalix-contracts/dist \
          /workspace/Signalix-frontend/node_modules/@signalix/contracts/dist

COPY Signalix-frontend/tsconfig.json ./Signalix-frontend/
COPY Signalix-frontend/next.config.ts ./Signalix-frontend/
COPY Signalix-frontend/tailwind.config.ts ./Signalix-frontend/
COPY Signalix-frontend/postcss.config.mjs ./Signalix-frontend/
COPY Signalix-frontend/src ./Signalix-frontend/src
COPY Signalix-frontend/public ./Signalix-frontend/public

RUN cd Signalix-frontend && npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /workspace/Signalix-frontend/.next/standalone ./
COPY --from=builder /workspace/Signalix-frontend/.next/static ./.next/static
COPY --from=builder /workspace/Signalix-frontend/public ./public

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
