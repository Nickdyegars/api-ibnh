import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AreaController } from './area.controller.js';

export async function areaRoutes(app: FastifyInstance) {
  const areaController = new AreaController();

  // === O CADEADO BLINDADO (Token + Nível) ===
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      return reply.status(401).send({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
    }
  });
  // ===============================================================

  app.get('/', (req, rep) => areaController.list(req, rep));
  app.post('/', (req, rep) => areaController.create(req, rep));
  app.delete('/:id', (req, rep) => areaController.delete(req, rep));
}