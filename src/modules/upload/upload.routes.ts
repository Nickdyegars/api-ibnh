// src/modules/upload/upload.routes.ts
import { FastifyInstance } from 'fastify';
import { uploadImage } from '../../shared/storage/minio.js'; // Ajuste o caminho se necessário

export async function uploadRoutes(app: FastifyInstance) {
  
  app.post('/', async (request, reply) => {
    try {
      // Recebe o arquivo do React
      const data = await request.file();
      
      if (!data) {
        return reply.status(400).send({ error: 'Nenhum arquivo enviado.' });
      }

      const fileBuffer = await data.toBuffer();
      
      // Usa a sua função existente e cria uma sub-pasta "galeria" no bucket
      const publicUrl = await uploadImage(
        data.filename, 
        fileBuffer, 
        data.mimetype, 
        'galeria' // 👈 Ficará tudo organizado na pasta /galeria dentro do seu bucket
      );

      // O Front-end está esperando { url: '...' }
      return reply.status(201).send({ url: publicUrl });

    } catch (error) {
      console.error('🔥 Erro no upload:', error);
      return reply.status(500).send({ error: 'Erro interno ao processar a imagem.' });
    }
  });
}