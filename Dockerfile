# Node.js 20 Alpine
FROM node:20-alpine

# Calisma dizini
WORKDIR /app

# Package dosyalarini kopyala
COPY package*.json ./

# Bagimliliklari yukle
RUN npm install

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
