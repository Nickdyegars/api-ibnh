import { FastifyInstance } from 'fastify';
import { MemberController } from './member.controller.js';

export async function memberRoutes(app: FastifyInstance) {
  const memberController = new MemberController();

  // === O CADEADO: Exige token válido para todas as rotas abaixo ===
  app.addHook('onRequest', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      return reply.status(401).send({ error: 'Não autorizado. Faça login novamente.' });
    }
  });
  // ===============================================================

  app.get('/members', (req, rep) => memberController.list(req, rep));
  app.post('/members', (req, rep) => memberController.create(req, rep));
  app.put('/members/:id', (req, rep) => memberController.update(req, rep));
  app.delete('/members/:id', (req, rep) => memberController.delete(req, rep));
}