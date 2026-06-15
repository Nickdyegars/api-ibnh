import { FastifyInstance } from 'fastify';
import { RosterController } from './roster.controller.js';

export async function rosterRoutes(app: FastifyInstance) {
  const rosterController = new RosterController();

  app.addHook('onRequest', async (request, reply) => {
    try { await request.jwtVerify(); } catch (err) { return reply.status(401).send({ error: 'Não autorizado.' }); }
  });

  app.get('/', (req, rep) => rosterController.list(req, rep));
  
  // NOVA ROTA POST AQUI:
  app.post('/', (req, rep) => rosterController.create(req, rep));
  
  app.delete('/:id', (req, rep) => rosterController.delete(req, rep));

  app.post('/generate', (req, rep) => rosterController.generatePreview(req, rep));

  app.put('/shift/:shiftId', (req, rep) => rosterController.updateShift(req, rep));

  app.post('/sync-calendar', (req, rep) => rosterController.syncCalendar(req, rep));
}