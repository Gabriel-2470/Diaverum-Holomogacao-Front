# build do Angular com Node 20
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build -- --configuration production

# rodar com nginx
FROM nginx:1.25-alpine

# Copiar build
COPY --from=build /app/dist/Front/browser /usr/share/nginx/html

# Copiar arquivo de configuração do Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
