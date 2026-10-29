// src/modules/upload/upload.routes.ts
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { uploadImage } from '../../shared/storage/minio.js';

export async function uploadRoutes(app: FastifyInstance) {

  // Requer autenticação (Painel Administrativo: Galeria e CMS)
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      return reply.status(401).send({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
    }
  });

  app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const parts = request.parts();
      let fileData: { filename: string; buffer: Buffer; mimetype: string } | null = null;
      let folder = 'galeria';

      const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];

      for await (const part of parts) {
        if (part.type === 'file') {
          if (!allowedMimeTypes.includes(part.mimetype)) {
            return reply.status(400).send({
              error: `Formato de arquivo não permitido: ${part.mimetype}. Envie apenas imagens JPG, PNG ou WEBP.`
            });
          }

          const buffer = await part.toBuffer();
          if (buffer.length === 0) {
            return reply.status(400).send({ error: 'O arquivo enviado está vazio.' });
          }

          fileData = {
            filename: part.filename,
            buffer,
            mimetype: part.mimetype
          };
        } else if (part.type === 'field' && part.fieldname === 'folder' && typeof part.value === 'string') {
          // Permite passar pasta personalizada (ex: 'cms', 'galeria/Culto 25-10', etc.)
          folder = part.value.trim().replace(/^\/+|\/+$/g, '') || 'galeria';
        }
      }

      if (!fileData) {
        return reply.status(400).send({ error: 'Nenhum arquivo enviado.' });
      }

      const publicUrl = await uploadImage(
        fileData.filename,
        fileData.buffer,
        fileData.mimetype,
        folder
      );

      return reply.status(201).send({ url: publicUrl });

    } catch (error) {
      console.error('🔥 Erro no upload:', error);
      return reply.status(500).send({ error: 'Erro interno ao processar a imagem.' });
    }
  });
}
