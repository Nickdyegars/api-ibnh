import { FastifyInstance } from 'fastify';
import { EventController } from './event.controller.js';

export async function eventRoutes(app: FastifyInstance) {
  const eventController = new EventController();

  // === ROTA PÚBLICA (Sem Cadeado) ===
  app.get('/public/events', (req, rep) => eventController.getPublic(req, rep));

  // === ROTAS PRIVADAS (Com Cadeado JWT) ===
  app.register(async function privateRoutes(childApp) {
    
    // 👇 O HOOK COM A TRAVA RBAC 👇
    childApp.addHook('onRequest', async (request, reply) => {
      try {
        await request.jwtVerify();
        const requester = request.user as any;
        
        // APENAS ADMINS (Nível 0) gerenciam a vitrine de eventos
        if (requester.level !== 0) {
          return reply.status(403).send({ 
            error: 'Acesso negado. Apenas administradores podem gerenciar os eventos.' 
          });
        }
      } catch (err) {
        return reply.status(401).send({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
      }
    });

    childApp.get('/cms/events', (req, rep) => eventController.getAll(req, rep));
    childApp.post('/cms/events', (req, rep) => eventController.create(req, rep));
    childApp.put('/cms/events/:id', (req, rep) => eventController.update(req, rep));
    childApp.delete('/cms/events/:id', (req, rep) => eventController.delete(req, rep));
  });
}