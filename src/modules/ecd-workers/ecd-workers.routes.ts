import { FastifyInstance } from 'fastify';
import { EcdWorkersController } from './ecd-workers.controller.js';
import { uploadImage } from '../../shared/storage/minio.js';
import { prisma } from '../../shared/database/prisma.js';

export async function ecdWorkersRoutes(app: FastifyInstance) {
  const controller = new EcdWorkersController();

  // === ROTAS PÚBLICAS (Onde o trabalhador preenche a ficha) ===
  // URL Final: /v1/ecd-workers/public/...
  app.post('/public/register', (req, rep) => controller.register(req, rep));
  app.get('/public/validate-token/:token', (req, rep) => controller.validateToken(req as any, rep));
  app.post('/public/register-generic', (req, rep) => controller.registerGeneric(req, rep));

  // Rota para receber o Áudio da Inscrição (Acessibilidade)
  app.post('/public/upload/audio', async (request, reply) => {
    try {
      const parts = request.parts();
      let fileData: any = null;
      let providedToken: string | null = null;

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

      // 👇 NOVA TRAVA DE SEGURANÇA (Busca pelo Líder) 👇
      const isValidToken = await prisma.ecdWorkerLeader.findUnique({
        where: { id: String(providedToken) }
      });

      if (!isValidToken) {
        return reply.status(401).send({ error: 'Token de inscrição inválido. Upload bloqueado.' });
      }

      // 3. UPLOAD PRO MINIO
      const fileName = `audio-${Date.now()}-${fileData.filename}`;

      const audioUrl = await uploadImage(
        fileName,
        fileData.buffer,
        fileData.mimetype,
        'ecd/audio'
      );

      return reply.send({ url: audioUrl });
    } catch (error) {
      console.error("Erro no upload do áudio:", error);
      return reply.status(500).send({ error: 'Erro interno ao salvar áudio.' });
    }
  });

  // Rota para Upload de Arquivos Diversos (Perfil/Comprovantes)
  app.post('/public/upload/:type', async (request, reply) => {
    try {
      const { type } = request.params as { type: string };

      let subfolder = 'outros';
      if (type === 'profile') subfolder = 'profiles';
      if (type === 'receipt') subfolder = 'receipts';

      const parts = request.parts();
      let fileData: any = null;
      let providedToken: string | null = null;

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
        return reply.status(400).send({ error: 'Arquivo ausente.' });
      }

      // 👇 NOVA TRAVA PÚBLICA (Protege o Perfil E o Comprovante) 👇
      if (type === 'profile' || type === 'receipt') {
        if (!providedToken) {
          return reply.status(400).send({ error: 'Token de autorização ausente no formulário.' });
        }

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(String(providedToken))) {
          return reply.status(400).send({ error: 'Formato de token inválido. Use um link oficial do evento.' });
        }

        // Nova busca correta validando o ID do líder
        const isValidToken = await prisma.ecdWorkerLeader.findUnique({
          where: { id: String(providedToken) }
        });

        if (!isValidToken) {
          return reply.status(401).send({ error: 'Token de inscrição inválido. Upload bloqueado.' });
        }
      }

      // 3. UPLOAD PRO MINIO
      const imageUrl = await uploadImage(
        fileData.filename,
        fileData.buffer,
        fileData.mimetype,
        `ecd/${subfolder}`
      );

      return reply.send({ url: imageUrl });
    } catch (error) {
      console.error("Erro no upload do ECD:", error);
      return reply.status(500).send({ error: 'Erro ao processar upload no servidor.' });
    }
  });

  // === ROTAS PRIVADAS (Painel CMS) ===
  // URL Final: /v1/ecd-workers/...
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
    childApp.get('/areas', (req, rep) => controller.getAreas(req, rep));
    childApp.post('/areas', (req, rep) => controller.createArea(req, rep));
    childApp.put('/areas/:id', (req, rep) => controller.updateArea(req, rep));
    childApp.delete('/areas/:id', (req, rep) => controller.deleteArea(req, rep));
    childApp.get('/leaders/:id/pdf', (req, rep) => controller.generatePdf(req, rep));

    // Líderes de Equipe
    childApp.get('/leaders', (req, rep) => controller.getLeaders(req, rep));
    childApp.post('/leaders', (req, rep) => controller.createLeader(req, rep));
    childApp.put('/leaders/:id', (req, rep) => controller.updateLeader(req, rep));
    childApp.delete('/leaders/:id', (req, rep) => controller.deleteLeader(req, rep));

    // Fichas (Pré-inscrição e Confirmados)
    childApp.get('/registrations', (req, rep) => controller.getRegistrations(req, rep));
    childApp.patch('/registrations/:id/approve', (req, rep) => controller.approveWorker(req, rep));
    childApp.patch('/registrations/:id/reject', (req, rep) => controller.rejectWorker(req, rep));
    childApp.patch('/registrations/:id/payment', (req, rep) => controller.updatePayment(req, rep));
    childApp.delete('/registrations/:id', (req, rep) => controller.deleteRegistration(req, rep));
    childApp.put('/registrations/:id', (req, rep) => controller.updateWorkerData(req, rep));
    childApp.get('/registrations/report-pdf', (req, rep) => controller.exportTrabalhadoresPdf(req, rep));
  });
}