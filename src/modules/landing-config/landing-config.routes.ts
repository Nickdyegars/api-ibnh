// src/modules/landing-config/landing-config.routes.ts
import { FastifyInstance } from 'fastify';
import { LandingConfigController } from './landing-config.controller.js';

export async function landingConfigRoutes(app: FastifyInstance) {
  const controller = new LandingConfigController();

  // ROTA PÚBLICA (Usada para exibir o botão no site)
  app.get('/public/landing-config', (req, rep) => controller.getPublicConfig(req, rep));

  // ROTAS PRIVADAS (Requer Login no Painel)
  app.register(async function privateRoutes(childApp) {
    
    childApp.addHook('onRequest', async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        return reply.status(401).send({ error: 'Não autorizado.' });
      }
    });

    // Rota para o painel salvar a nova configuração do botão
    childApp.put('/cms/landing-config', (req, rep) => controller.updateConfig(req, rep));
  });
}