# ==========================================
# ESTÁGIO 1: CONSTRUTOR (Builder)
# ==========================================
FROM node:20-slim AS builder

WORKDIR /app

# Instala o OpenSSL para o Prisma conseguir gerar os binários
RUN apt-get update -y && apt-get install -y openssl

# Copia dependências e instala TUDO (incluindo devDependencies)
COPY package*.json ./
COPY prisma ./prisma/
RUN npm install

# Copia o resto do código e faz o build
COPY . .
RUN npx prisma generate
RUN npm run build


# ==========================================
# ESTÁGIO 2: PRODUÇÃO (A Imagem Final Leve)
# ==========================================
FROM node:20-slim

WORKDIR /app

# Instala o OpenSSL, mas limpa o "lixo" do apt-get logo a seguir para poupar espaço
RUN apt-get update -y && apt-get install -y openssl && apt-get clean && rm -rf /var/lib/apt/lists/*

# Copia APENAS os ficheiros estritamente necessários
COPY package*.json ./
COPY prisma ./prisma/

# Instala APENAS dependências de produção (ignora TypeScript, etc)
RUN npm install --omit=dev

# Gera o cliente do Prisma otimizado para produção
RUN npx prisma generate

# Copia a pasta /dist que foi compilada no Estágio 1
COPY --from=builder /app/dist ./dist

# Expõe a porta e inicia o servidor
EXPOSE 3333
CMD ["npm", "start"]