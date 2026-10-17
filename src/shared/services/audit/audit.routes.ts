import { FastifyInstance } from 'fastify';
import { AuditController } from './audit.controller.js';

const auditController = new AuditController();

export async function auditRoutes(app: FastifyInstance) {
  // Trava de Segurança Máxima (Token + Nível)
  app.addHook('onRequest', async (request, reply) => {
    try {
      await request.jwtVerify();
      const requester = request.user as any;
      const userLevel = Number(requester?.level ?? requester?.user_level);

      // APENAS ADMINS MASTER (Nível 0) visualizam a auditoria
      if (userLevel !== 0 && requester?.role !== 'admin') {
        return reply.status(403).send({
          error: 'Acesso negado. Apenas administradores master podem visualizar a auditoria.'
        });
      }
    } catch (err) {
      return reply.status(401).send({ error: 'Sessão inválida. Faça login.' });
    }
  });

  // Responde tanto em /v1/audit quanto em /v1/audit/
  app.get('/', (req, rep) => auditController.getLogs(req, rep));
  app.get('/audit', (req, rep) => auditController.getLogs(req, rep));
}
