import { FastifyInstance } from 'fastify';
import { EcdWorkersController } from './ecd-workers.controller.js';
import { uploadImage } from '../../shared/storage/minio.js';
// IMPORTANTE: Ajuste o caminho abaixo para onde o seu Prisma Client está instanciado no projeto
import { prisma } from '../../shared/database/prisma.js';

export async function ecdWorkersRoutes(app: FastifyInstance) {
  const controller = new EcdWorkersController();

  // Rota Pública: Onde o trabalhador preenche a ficha
  app.post('/public/ecd-workers/register', (req, rep) => controller.register(req, rep));
  app.get('/public/ecd-workers/validate-token/:token', (req, rep) => controller.validateToken(req as any, rep));
  app.post('/public/ecd-workers/register-generic', (req, rep) => controller.registerGeneric(req, rep));

  // Rota para receber o Áudio da Inscrição (Acessibilidade)
  app.post('/public/ecd-workers/upload/audio', async (request, reply) => {
    try {
      const parts = request.parts();
      let fileData: any = null;
      let providedToken: string | null = null;

      // 1. Extrai o arquivo e o token de forma 100% segura para o TypeScript
      for await (const part of parts) {
        if (part.type === 'file') {
          const buffer = await part.toBuffer();
          fileData = {
            filename: part.filename,
            mimetype: part.mimetype,
            buffer: buffer
          };
        } else if (part.fieldname === 'token') {
          providedToken = part.value as string;
        }
      }

      if (!fileData) {
        return reply.status(400).send({ error: 'Nenhum áudio enviado.' });
      }

      if (!providedToken) {
        return reply.status(400).send({ error: 'Token de autorização ausente.' });
      }

      // 2. TRAVA DE SEGURANÇA
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(String(providedToken))) {
        return reply.status(400).send({ error: 'Formato de token inválido.' });
      }

      let isValidToken = await prisma.ecdWorkerToken.findFirst({
        where: { token_code: String(providedToken) }
      });

      if (!isValidToken) {
        const isEditionToken = await prisma.ecdEdition.findFirst({
          where: { public_token: String(providedToken) }
        });
        if (isEditionToken) isValidToken = true as any;
      }

      if (!isValidToken) {
        return reply.status(401).send({ error: 'Token de inscrição inválido. Upload bloqueado.' });
      }

      // 3. UPLOAD PRO MINIO (Usando a função uploadImage existente)
      const fileName = `audio-${Date.now()}-${fileData.filename}`;

      const audioUrl = await uploadImage(
        fileName,
        fileData.buffer,
        fileData.mimetype,
        'ecd/audio' // Salva o áudio organizadinho na subpasta
      );

      return reply.send({ url: audioUrl });
    } catch (error) {
      console.error("Erro no upload do áudio:", error);
      return reply.status(500).send({ error: 'Erro interno ao salvar áudio.' });
    }
  });

  app.post('/public/ecd-workers/upload/:type', async (request, reply) => {
    try {
      const { type } = request.params as { type: string };

      let subfolder = 'outros';
      if (type === 'profile') subfolder = 'perfil';
      if (type === 'receipt') subfolder = 'comprovantes';

      // 1. TRAVA DO ADMIN: Se for comprovativo, exige JWT de Admin logado!
      if (type === 'receipt') {
        try {
          await request.jwtVerify();
        } catch (err) {
          return reply.status(401).send({ error: 'Acesso negado. Apenas administradores podem enviar comprovantes.' });
        }
      }

      const parts = request.parts();
      let fileData: any = null;
      let providedToken: string | null = null;

      // 👇 A MÁGICA ACONTECE AQUI: O arquivo é lido IMEDIATAMENTE dentro do loop
      for await (const part of parts) {
        if (part.type === 'file') {
          // Extrai o buffer na hora para não travar o stream do Fastify
          const buffer = await part.toBuffer();
          fileData = {
            filename: part.filename,
            mimetype: part.mimetype,
            buffer: buffer
          };
        } else if (part.fieldname === 'token') {
          providedToken = part.value as string;
        }
      }

      if (!fileData) {
        return reply.status(400).send({ error: 'Arquivo ausente.' });
      }

      // 2. TRAVA PÚBLICA: Se for foto de perfil, valida o Token.
      if (type === 'profile') {
        if (!providedToken) {
          return reply.status(400).send({ error: 'Token de autorização ausente no formulário.' });
        }

        // 👇 BLINDAGEM CONTRA CRASH DO PRISMA 👇
        // Verifica se o texto enviado tem exatamente o formato de um UUID válido
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(String(providedToken))) {
          return reply.status(400).send({ error: 'Formato de token inválido. Use um link oficial do evento.' });
        }

        // Tenta achar o token na tabela de Líderes
        let isValidToken = await prisma.ecdWorkerToken.findFirst({
          where: { token_code: String(providedToken) }
        });

        // SE NÃO ACHOU NOS LÍDERES, PROCURA NAS EDIÇÕES
        if (!isValidToken) {
          const isEditionToken = await prisma.ecdEdition.findFirst({
            where: { public_token: String(providedToken) }
          });

          if (isEditionToken) isValidToken = true as any;
        }

        if (!isValidToken) {
          return reply.status(401).send({ error: 'Token de inscrição inválido. Upload bloqueado.' });
        }
      }

      // 3. UPLOAD PRO MINIO (Agora usando as propriedades que salvamos no objeto)
      const imageUrl = await uploadImage(
        fileData.filename,
        fileData.buffer, // Usa o buffer que já extraímos
        fileData.mimetype,
        `ecd/${subfolder}`
      );

      return reply.send({ url: imageUrl });
    } catch (error) {
      console.error("Erro no upload do ECD:", error);
      return reply.status(500).send({ error: 'Erro ao processar upload no servidor.' });
    }
  });

  // Rotas Privadas: Painel CMS
  app.register(async function privateRoutes(childApp) {

    // Trava de Segurança Nível 0
    childApp.addHook('onRequest', async (request, reply) => {
      try {
        await request.jwtVerify();
        const requester = request.user as any;
        if (requester.level !== 0 && requester.user_level !== 0) {
          return reply.status(403).send({ error: 'Acesso negado. Apenas Nível 0.' });
        }
      } catch (err) {
        return reply.status(401).send({ error: 'Não autorizado.' });
      }
    });

    // Áreas de Trabalho
    childApp.get('/cms/ecd-workers/areas', (req, rep) => controller.getAreas(req, rep));
    childApp.post('/cms/ecd-workers/areas', (req, rep) => controller.createArea(req, rep));
    childApp.put('/cms/ecd-workers/areas/:id', (req, rep) => controller.updateArea(req, rep));
    childApp.delete('/cms/ecd-workers/areas/:id', (req, rep) => controller.deleteArea(req, rep));

    // Líderes de Equipe
    childApp.get('/cms/ecd-workers/leaders', (req, rep) => controller.getLeaders(req, rep));
    childApp.post('/cms/ecd-workers/leaders', (req, rep) => controller.createLeader(req, rep));
    childApp.put('/cms/ecd-workers/leaders/:id', (req, rep) => controller.updateLeader(req, rep));
    childApp.delete('/cms/ecd-workers/leaders/:id', (req, rep) => controller.deleteLeader(req, rep));

    // Fichas (Pré-inscrição e Confirmados)
    childApp.get('/cms/ecd-workers/registrations', (req, rep) => controller.getRegistrations(req, rep));
    childApp.patch('/cms/ecd-workers/registrations/:id/approve', (req, rep) => controller.approveWorker(req, rep));
    childApp.patch('/cms/ecd-workers/registrations/:id/reject', (req, rep) => controller.rejectWorker(req, rep));
    childApp.patch('/cms/ecd-workers/registrations/:id/payment', (req, rep) => controller.updatePayment(req, rep));
    childApp.delete('/cms/ecd-workers/registrations/:id', (req, rep) => controller.deleteRegistration(req, rep));
    childApp.put('/cms/ecd-workers/registrations/:id', (req, rep) => controller.updateWorkerData(req, rep));
  });
}