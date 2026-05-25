import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { MemberController } from './member.controller.js';

export async function memberRoutes(app: FastifyInstance) {
  const memberController = new MemberController();

  // === O CADEADO BLINDADO (Token + Nível) ===
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      // Opcional: Se apenas Admin (0) e Líderes (1) podem acessar essa área:
      // const requester = request.user as any;
      // if (requester.level > 1) return reply.status(403).send({ error: 'Acesso negado.' });
    } catch (err) {
      return reply.status(401).send({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
    }
  });
  // ===============================================================

  app.get('/members', (req, rep) => memberController.list(req, rep));
  app.post('/members', (req, rep) => memberController.create(req, rep));
  app.put('/members/:id', (req, rep) => memberController.update(req, rep));
  app.delete('/members/:id', (req, rep) => memberController.delete(req, rep));
}