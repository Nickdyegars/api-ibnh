// src/modules/events/event.routes.ts
import { FastifyInstance } from 'fastify';
import { EventController } from './event.controller.js';

export async function eventRoutes(app: FastifyInstance) {
  const eventController = new EventController();

  // === ROTA PÚBLICA (Sem Cadeado) ===
  // Qualquer pessoa no site consegue ver os próximos 3 eventos
  app.get('/public/events', (req, rep) => eventController.getPublic(req, rep));

  // === ROTAS PRIVADAS (Com Cadeado JWT) ===
  // Criamos um contexto separado para o Hook não bloquear a rota pública
  app.register(async function privateRoutes(childApp) {
    
    // Hook de proteção aplica-se apenas às rotas dentro do childApp
    childApp.addHook('onRequest', async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        return reply.status(401).send({ error: 'Não autorizado. Faça login novamente.' });
      }
    });

    childApp.get('/cms/events', (req, rep) => eventController.getAll(req, rep));
    childApp.post('/cms/events', (req, rep) => eventController.create(req, rep));
    childApp.put('/cms/events/:id', (req, rep) => eventController.update(req, rep));
    childApp.delete('/cms/events/:id', (req, rep) => eventController.delete(req, rep));
  });
}