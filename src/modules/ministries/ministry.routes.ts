import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { MinistryController } from './ministry.controller.js';

export async function ministryRoutes(app: FastifyInstance) {
  const ministryController = new MinistryController();

  // Trava de autenticação JWT
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      return reply.status(401).send({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
    }
  });

  app.get('/', (req, rep) => ministryController.list(req, rep));
  app.post('/', (req, rep) => ministryController.create(req, rep));
  app.put('/:id', (req, rep) => ministryController.update(req, rep));
  app.delete('/:id', (req, rep) => ministryController.delete(req, rep));
}
