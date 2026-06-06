import { FastifyInstance } from 'fastify';
import { EcdController } from './ecd.controller.js';

export async function ecdRoutes(app: FastifyInstance) {
  const ecdController = new EcdController();

  app.post('/public/ecd/register', (req, rep) => ecdController.register(req, rep));
  app.get('/public/ecd/validate-token/:token', (req, rep) => ecdController.validateToken(req as any, rep));

  app.register(async function privateRoutes(childApp) {
    
    // 👇 TRAVA DE SEGURANÇA MÁXIMA: NÍVEL 0 👇
    childApp.addHook('onRequest', async (request, reply) => {
      try {
        await request.jwtVerify();
        const requester = request.user as any;
        
        // Verifica ambas as nomenclaturas (level ou user_level) para evitar bugs de JWT
        if (requester.level !== 0 && requester.user_level !== 0) {
          return reply.status(403).send({ 
            error: 'Acesso negado. Apenas administradores (Nível 0) podem gerenciar o Painel do ECD.' 
          });
        }
      } catch (err) {
        return reply.status(401).send({ error: 'Não autorizado. Faça login novamente.' });
      }
    });

    // Edições
    childApp.get('/cms/ecd/editions', (req, rep) => ecdController.getEditions(req, rep));
    childApp.post('/cms/ecd/editions', (req, rep) => ecdController.createEdition(req, rep));
    childApp.put('/cms/ecd/editions/:id', (req, rep) => ecdController.updateEdition(req, rep));
    childApp.delete('/cms/ecd/editions/:id', (req, rep) => ecdController.deleteEdition(req, rep));

    // Líderes
    childApp.get('/cms/ecd/leaders', (req, rep) => ecdController.getLeaders(req, rep));
    childApp.post('/cms/ecd/leaders', (req, rep) => ecdController.createLeader(req, rep));
    childApp.patch('/cms/ecd/leaders/:id', (req, rep) => ecdController.updateLeader(req, rep));
    childApp.delete('/cms/ecd/leaders/:id', (req, rep) => ecdController.deleteLeader(req, rep));
    
    // Inscritos / Fichas
    childApp.get('/cms/ecd/registrations', (req, rep) => ecdController.getRegistrations(req, rep));
    childApp.patch('/cms/ecd/registrations/:id/payment', (req, rep) => ecdController.updatePayment(req, rep));
    childApp.delete('/cms/ecd/registrations/:id', (req, rep) => ecdController.deleteRegistration(req, rep));
    childApp.put('/cms/ecd/registrations/:id/complete', (req, rep) => ecdController.completeRegistration(req, rep));
  });
}