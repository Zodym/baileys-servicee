# Node.js 20 Alpine
FROM node:20-alpine

# Git ve gerekli build araclari yukle (baileys icin gerekli)
RUN apk add --no-cache git python3 make g++

# Calisma dizini
WORKDIR /app

# Package dosyalarini kopyala
COPY package*.json ./

# Bagimliliklari yukle
RUN npm install --legacy-peer-deps

# Kaynak kodlari kopyala
COPY . .

# TypeScript derle
RUN npm run build

# Auth sessions klasoru olustur
RUN mkdir -p auth_sessions

# Port
EXPOSE 3001

# Servisi baslat
CMD ["npm", "start"]
