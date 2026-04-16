// src/modules/community-business/community-business.routes.ts
import { FastifyInstance } from 'fastify';
import { CommunityBusinessController } from './community-business.controller.js';

export async function communityBusinessRoutes(app: FastifyInstance) {
  const controller = new CommunityBusinessController();

  // === ROTA PÚBLICA (Livre para o Site) ===
  app.get('/public/community-businesses', (req, rep) => controller.getPublic(req, rep));
  app.post('/public/community-businesses/:id/click', (request, reply) => controller.registerClick(request, reply));

  // === ROTAS PRIVADAS (Requer Login no Painel) ===
  app.register(async function privateRoutes(childApp) {
    
    // Hook de Autenticação JWT (Igual ao seu padrão)
    childApp.addHook('onRequest', async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        return reply.status(401).send({ error: 'Não autorizado.' });
      }
    });

    // CRUD do Painel
    childApp.get('/cms/community-businesses', (req, rep) => controller.getAllCms(req, rep));
    childApp.post('/cms/community-businesses', (req, rep) => controller.create(req, rep));
    childApp.put('/cms/community-businesses/:id', (req, rep) => controller.update(req, rep));
    childApp.delete('/cms/community-businesses/:id', (req, rep) => controller.delete(req, rep));
    childApp.post('/cms/community-businesses/upload', (req, rep) => controller.uploadLogo(req, rep));
  });
}