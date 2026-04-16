// src/modules/community-business-category/community-business-category.routes.ts
import { FastifyInstance } from 'fastify';
import { CommunityBusinessCategoryController } from './community-business-category.controller.js';

export async function communityBusinessCategoryRoutes(app: FastifyInstance) {
  const controller = new CommunityBusinessCategoryController();

  // ROTA PÚBLICA (Usada para preencher o <select> no site)
  app.get('/public/community-categories', (req, rep) => controller.getPublic(req, rep));

  // ROTAS PRIVADAS (Requer Login no Painel)
  app.register(async function privateRoutes(childApp) {
    
    childApp.addHook('onRequest', async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        return reply.status(401).send({ error: 'Não autorizado.' });
      }
    });

    childApp.get('/cms/community-categories', (req, rep) => controller.getAllCms(req, rep));
    childApp.post('/cms/community-categories', (req, rep) => controller.create(req, rep));
    childApp.put('/cms/community-categories/:id', (req, rep) => controller.update(req, rep));
    childApp.delete('/cms/community-categories/:id', (req, rep) => controller.delete(req, rep));
  });
}