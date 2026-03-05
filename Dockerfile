# 1. Usa uma imagem oficial do Node.js (versão slim para ser mais leve)
FROM node:20-slim

# 2. Instala o OpenSSL (Obrigatório para o Prisma rodar no Linux)
RUN apt-get update -y && apt-get install -y openssl

# 3. Define a pasta de trabalho dentro do container
WORKDIR /app

# 4. Copia apenas os arquivos de dependências primeiro (otimiza o cache do Docker)
COPY package.json package-lock.json* ./

# 5. Instala as dependências
RUN npm install

# 6. Copia a pasta do Prisma e gera o cliente do banco de dados
COPY prisma ./prisma
RUN npx prisma generate

# 7. Copia o restante do código do projeto
COPY . .

# 8. Faz o build do TypeScript para JavaScript (Se você usar tsup ou tsc)
RUN npm run build

# 9. Expõe a porta que o Fastify vai rodar
EXPOSE 3333

# 10. Comando para iniciar o servidor em produção
CMD ["npm", "start"]