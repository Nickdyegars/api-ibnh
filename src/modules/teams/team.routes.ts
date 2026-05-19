import { FastifyInstance } from 'fastify';
import { TeamController } from './team.controller.js';

export async function teamRoutes(app: FastifyInstance) {
  const teamController = new TeamController();

  // Trava de segurança com JWT
  app.addHook('onRequest', async (request, reply) => {
    try { 
        await request.jwtVerify(); 
    } catch (err) { 
        return reply.status(401).send({ error: 'Não autorizado.' }); 
    }
  });

  app.get('/teams', (req, rep) => teamController.list(req, rep));
  app.post('/teams', (req, rep) => teamController.create(req, rep));
  app.delete('/teams/:id', (req, rep) => teamController.delete(req, rep));
}