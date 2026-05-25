import { FastifyInstance } from 'fastify';
import { FinanceController } from './finance.controller.js';

export async function financeRoutes(app: FastifyInstance) {
  const financeController = new FinanceController();

  // 👇 O HOOK DE SEGURANÇA GERAL DO FINANCEIRO 👇
  app.addHook('onRequest', async (request, reply) => {
    try {
      // 1. Primeiro verifica se o token é válido e existe
      await request.jwtVerify();
      
      // 2. Puxa os dados do token e verifica se é Admin
      const requester = request.user as any;
      if (requester.level !== 0) {
        return reply.status(403).send({ 
          error: 'Acesso negado. Apenas administradores têm acesso ao módulo financeiro.' 
        });
      }
    } catch (err) {
      // Se não tiver token ou estiver expirado, cai aqui
      return reply.status(401).send({ error: 'Acesso negado. Faça login novamente.' });
    }
  });

  // ==============================================================
  // A PARTIR DAQUI, TODAS AS ROTAS ESTÃO 100% BLINDADAS E SEGURAS
  // ==============================================================

  // Entradas
  app.get('/', financeController.getAll);
  app.post('/', financeController.create);
  app.put('/:id', financeController.update);
  app.delete('/:id', financeController.delete);

  // Saídas
  app.get('/expenses', financeController.getAllExpenses);
  app.post('/expenses', financeController.createExpense);
  app.put('/expenses/:id', financeController.updateExpense);
  app.delete('/expenses/:id', financeController.deleteExpense);

  // Categorias
  app.get('/categories', financeController.getCategories);
  app.post('/categories', financeController.createCategory);
  app.delete('/categories/:id', financeController.deleteCategory);
}