FROM node:16 AS build
WORKDIR /build
COPY . .
RUN yarn install --immutable
RUN yarn build

FROM logionnetwork/logion-pg-backup-manager-base:v1
COPY --from=build /build/dist dist
COPY --from=build /build/node_modules node_modules

CMD node ./dist/index.js
