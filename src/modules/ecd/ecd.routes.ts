import { FastifyInstance } from 'fastify';
import { EcdController } from './ecd.controller.js';

export async function ecdRoutes(app: FastifyInstance) {
  const ecdController = new EcdController();

  // === ROTA PÚBLICA (Pessoas de fora preenchendo a ficha) ===
  app.post('/public/ecd/register', (req, rep) => ecdController.register(req, rep));
  app.get('/public/ecd/validate-token/:token', (req, rep) => ecdController.validateToken(req as any, rep));

  // === ROTAS PRIVADAS (Painel Admin) ===
  app.register(async function privateRoutes(childApp) {
    
    // 👇 O HOOK DE SEGURANÇA MÁXIMA 👇
    childApp.addHook('onRequest', async (request, reply) => {
      try {
        await request.jwtVerify();
        const requester = request.user as any;
        
        // APENAS ADMINS podem ver e gerenciar os dados de saúde e fichas do ECD
        if (requester.level !== 0) {
          return reply.status(403).send({ 
            error: 'Acesso negado. Apenas administradores podem gerenciar o Encontro com Deus.' 
          });
        }
      } catch (err) {
        return reply.status(401).send({ error: 'Não autorizado. Faça login novamente.' });
      }
    });

    // Como o hook acima barra intrusos, o Controller fica focado só nos dados:
    childApp.get('/cms/ecd/leaders', (req, rep) => ecdController.getLeaders(req, rep));
    childApp.post('/cms/ecd/leaders', (req, rep) => ecdController.createLeader(req, rep));
    childApp.get('/cms/ecd/registrations', (req, rep) => ecdController.getRegistrations(req, rep));
    childApp.patch('/cms/ecd/registrations/:id/payment', (req, rep) => ecdController.updatePayment(req, rep));
    childApp.patch('/cms/ecd/leaders/:id', (req, rep) => ecdController.updateLeader(req, rep));
    childApp.delete('/cms/ecd/leaders/:id', (req, rep) => ecdController.deleteLeader(req, rep));
    childApp.delete('/cms/ecd/registrations/:id', (req, rep) => ecdController.deleteRegistration(req, rep));
  });
}