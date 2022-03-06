FROM node:14

COPY . /mangrove
WORKDIR /mangrove
RUN yarn install
RUN yarn build

WORKDIR /mangrove/packages/obfiller-bot

ENTRYPOINT [ "yarn" ]
CMD ["start"]