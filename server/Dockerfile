# Use Node.js LTS
FROM node:22

WORKDIR /app

COPY package.json ./

RUN npm install

RUN mkdir -p /app/config

COPY dist/ /app/

# Catch incomplete production bundles before publishing a broken image.
RUN node -e "JSON.parse(require('node:fs').readFileSync('/app/views/attendance-openapi.json', 'utf8'))"
RUN node -e "for (const name of ['swagger-api-view.json', 'swagger-api-v2-view.json']) { const spec = JSON.parse(require('node:fs').readFileSync('/app/views/' + name, 'utf8')); if (!Object.keys(spec.paths || {}).length) throw new Error(name + ' has no API routes'); }"

CMD ["npm", "run", "production"]
