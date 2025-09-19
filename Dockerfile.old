FROM node:18 AS builder
ARG BASE_HREF
RUN mkdir -p /app
WORKDIR /app
COPY package.json /app
COPY package-lock.json /app
COPY node_modules /app/node_modules
COPY . /app/
RUN npm install webpack@5.76.1 --save-dev --legacy-peer-deps
RUN  npm run build -- --configuration staging --aot
##RUN npm run build -- --prod --aot --base-href ./
##RUN npm run build -- --prod --aot



FROM nginx
EXPOSE 80
COPY --from=builder /app/dist/ /usr/share/nginx/html/




