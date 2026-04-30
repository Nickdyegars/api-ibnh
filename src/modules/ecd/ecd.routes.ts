// src/modules/ecd/ecd.routes.ts
import { FastifyInstance } from 'fastify';
import { EcdController } from './ecd.controller.js';

export async function ecdRoutes(app: FastifyInstance) {
  const ecdController = new EcdController();

  // === ROTA PÚBLICA (Sem Cadeado) ===
  // Inscrição a partir do link que o líder enviou via WhatsApp
  app.post('/public/ecd/register', (req, rep) => ecdController.register(req, rep));

  // === ROTAS PRIVADAS (Com Cadeado JWT) ===
  app.register(async function privateRoutes(childApp) {
    
    childApp.addHook('onRequest', async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        return reply.status(401).send({ error: 'Não autorizado. Faça login novamente.' });
      }
    });

    // 👇 Rotas do Painel CMS 👇
    childApp.get('/cms/ecd/leaders', (req, rep) => ecdController.getLeaders(req, rep));
    childApp.post('/cms/ecd/leaders', (req, rep) => ecdController.createLeader(req, rep));
    childApp.get('/cms/ecd/registrations', (req, rep) => ecdController.getRegistrations(req, rep));
  });
}