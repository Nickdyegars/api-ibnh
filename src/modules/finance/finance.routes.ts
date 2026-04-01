// src/modules/finance/finance.routes.ts
import { FastifyInstance } from 'fastify';
import { FinanceController } from './finance.controller.js';

export async function financeRoutes(app: FastifyInstance) {
  const financeController = new FinanceController();

  // TODAS AS ROTAS FINANCEIRAS SÃO PRIVADAS
  app.register(async function privateRoutes(childApp) {
    
    // O Cadeado JWT
    childApp.addHook('onRequest', async (request, reply) => {
      try {
        await request.jwtVerify();
        // Nota: Mais tarde, podemos adicionar aqui uma verificação para ver se o user.level === 0 (Admin)
      } catch (err) {
        return reply.status(401).send({ error: 'Acesso negado ao módulo financeiro.' });
      }
    });

    childApp.get('/finance', (req, rep) => financeController.getAll(req, rep));
    childApp.post('/finance', (req, rep) => financeController.create(req, rep));
    childApp.put('/finance/:id', (req, rep) => financeController.update(req, rep));
    childApp.delete('/finance/:id', (req, rep) => financeController.delete(req, rep));
  });
}