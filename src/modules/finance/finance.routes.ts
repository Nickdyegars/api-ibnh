import { FastifyInstance } from 'fastify';
import { FinanceController } from './finance.controller.js';

export async function financeRoutes(app: FastifyInstance) {
  const financeController = new FinanceController();

  app.register(async function privateRoutes(childApp) {
    
    childApp.addHook('onRequest', async (request, reply) => {
      try {
        // 1. Verifica se o token é válido e decodifica os dados
        const decoded = await request.jwtVerify(); 
        
        // 2. O 'decoded' geralmente contém os dados do usuário que você colocou no token no momento do login.
        // Assumindo que você guardou o nível lá dentro como 'level' ou 'user_level'.
        const userLevel = (decoded as any).level; // ou (decoded as any).user_level

        // 3. Verifica se tem permissão (Nível 0 ou 1)
        if (userLevel !== 0) {
          return reply.status(403).send({ error: 'Acesso negado: Você não tem permissões financeiras.' });
        }
      } catch (err) {
        return reply.status(401).send({ error: 'Token inválido ou não fornecido.' });
      }
    });

    // Rotas de Entradas
    childApp.get('/finance', (req, rep) => financeController.getAll(req, rep));
    childApp.post('/finance', (req, rep) => financeController.create(req, rep));
    childApp.put('/finance/:id', (req, rep) => financeController.update(req, rep));
    childApp.delete('/finance/:id', (req, rep) => financeController.delete(req, rep));

    // === NOVO: Rotas de Saídas ===
    childApp.get('/finance/expenses', (req, rep) => financeController.getAllExpenses(req, rep));
    childApp.post('/finance/expenses', (req, rep) => financeController.createExpense(req, rep));
    childApp.put('/finance/expenses/:id', (req, rep) => financeController.updateExpense(req, rep));
    childApp.delete('/finance/expenses/:id', (req, rep) => financeController.deleteExpense(req, rep));

    childApp.get('/finance/categories', (req, rep) => financeController.getCategories(req, rep));
    childApp.post('/finance/categories', (req, rep) => financeController.createCategory(req, rep));
    childApp.delete('/finance/categories/:id', (req, rep) => financeController.deleteCategory(req, rep));
  });
}