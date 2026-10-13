# Use an official Node runtime as the base image
FROM node:24-slim AS base
WORKDIR /usr/src/app
RUN npm install --global --ignore-scripts npm@12.1.0

# Build stage - install ALL dependencies and build
FROM base AS build
ENV HUSKY=0
# Copy package files first for better caching. The workspace manifests come
# along so npm ci can link node_modules/@openfront/* to packages/*.
COPY package*.json .npmrc ./
COPY packages/engine/package.json ./packages/engine/
COPY packages/engine-api/package.json ./packages/engine-api/
COPY packages/engine-lib/package.json ./packages/engine-lib/
COPY packages/shared/package.json ./packages/shared/
COPY packages/zbin/package.json ./packages/zbin/
RUN --mount=type=cache,target=/root/.npm \
    npm ci --ignore-scripts

# Copy only what's needed for build
COPY tsconfig.json tsconfig.base.json ./
COPY vite.config.ts ./
COPY eslint.config.js ./
COPY index.html ./
COPY resources ./resources
COPY proprietary ./proprietary
COPY src ./src
COPY packages ./packages

ARG GIT_COMMIT=unknown
ENV GIT_COMMIT="$GIT_COMMIT"
RUN npm run build-prod

# Production dependencies stage - separate from build
FROM base AS prod-deps
ENV HUSKY=0
ENV NPM_CONFIG_IGNORE_SCRIPTS=1
COPY package*.json .npmrc ./
COPY packages/engine/package.json ./packages/engine/
COPY packages/engine-api/package.json ./packages/engine-api/
COPY packages/engine-lib/package.json ./packages/engine-lib/
COPY packages/shared/package.json ./packages/shared/
COPY packages/zbin/package.json ./packages/zbin/
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --ignore-scripts

# Final production image
FROM base

# Copy production node_modules from prod-deps stage (cached separately from build)
COPY --from=prod-deps /usr/src/app/node_modules ./node_modules
COPY package*.json ./

# Copy built artifacts from build stage
COPY --from=build /usr/src/app/static ./static

COPY tsconfig.json tsconfig.base.json ./
COPY src ./src
# node_modules/@openfront/* are symlinks into packages/; without this copy
# they dangle and the server dies at boot.
COPY packages ./packages

ARG GIT_COMMIT=unknown
ENV GIT_COMMIT="$GIT_COMMIT"
ENV GAME_ENV=prod

EXPOSE 3000
CMD ["npm", "run", "start:server"]
