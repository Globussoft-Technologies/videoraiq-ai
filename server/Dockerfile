# Use Node.js LTS
FROM node:22

WORKDIR /app

COPY package.json ./

RUN npm install

RUN mkdir -p /app/config

COPY dist/ /app/

# Catch incomplete production bundles before publishing a broken image.
RUN node -e "JSON.parse(require('node:fs').readFileSync('/app/views/attendance-openapi.json', 'utf8'))"

CMD ["npm", "run", "production"]
