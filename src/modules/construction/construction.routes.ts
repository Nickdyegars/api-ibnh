// src/modules/construction/construction.routes.ts
import { FastifyInstance } from 'fastify';
import { ConstructionController } from './construction.controller.js';

export async function constructionRoutes(app: FastifyInstance) {
  const constructionController = new ConstructionController();

  // === ROTA PÚBLICA (Para o site carregar tudo de uma vez) ===
  app.get('/public/construction', (req, rep) => constructionController.getPublicData(req, rep));

  // === ROTAS PRIVADAS (Com Cadeado JWT para o Painel) ===
  app.register(async function privateRoutes(childApp) {
    
    childApp.addHook('onRequest', async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        return reply.status(401).send({ error: 'Não autorizado.' });
      }
    });

    // Info do PIX e Links
    childApp.get('/cms/construction/info', (req, rep) => constructionController.getInfo(req, rep));
    childApp.put('/cms/construction/info', (req, rep) => constructionController.updateInfo(req, rep));
    
    // Gestão de Fotos
    childApp.get('/cms/construction/photos', (req, rep) => constructionController.getPhotos(req, rep));
    childApp.post('/cms/construction/photos', (req, rep) => constructionController.addPhoto(req, rep));
    childApp.delete('/cms/construction/photos/:id', (req, rep) => constructionController.deletePhoto(req, rep));
  });
}