# Use Node.js LTS
FROM node:22

WORKDIR /app

COPY package.json ./

RUN npm install

RUN mkdir -p /app/config

COPY dist/ /app/

CMD ["npm", "run", "production"]
