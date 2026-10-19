import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { CongregationController } from './congregation.controller.js';

export async function congregationRoutes(app: FastifyInstance) {
  const controller = new CongregationController();

  // Trava de autenticação JWT
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      return reply.status(401).send({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
    }
  });

  app.get('/', (req, rep) => controller.list(req, rep));
  app.get('/:id', (req, rep) => controller.getById(req, rep));
  app.post('/', (req, rep) => controller.create(req, rep));
  app.put('/:id', (req, rep) => controller.update(req, rep));
  app.delete('/:id', (req, rep) => controller.delete(req, rep));
}
