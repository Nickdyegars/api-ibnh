import { FastifyInstance } from 'fastify';
import { AnalyticsController } from './analytics.controller.js';

export async function analyticsRoutes(app: FastifyInstance) {
  const analyticsController = new AnalyticsController();

  // 🌐 ROTA PÚBLICA: Sem cadeado. A Landing Page manda os dados livremente.
  app.post('/', (req, rep) => analyticsController.registerAction(req, rep));

  // 🔒 ROTA PRIVADA: Colocamos o seu onRequest direto na configuração desta rota!
  app.get('/dashboard', {
    onRequest: async (request, reply) => {
      try { 
        await request.jwtVerify(); 
      } catch (err) { 
        return reply.status(401).send({ error: 'Não autorizado.' }); 
      }
    }
  }, (req, rep) => analyticsController.getDashboardStats(req, rep));
}