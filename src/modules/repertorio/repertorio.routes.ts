import { FastifyInstance } from 'fastify';
import { repertorioController } from './repertorio.controller.js';

export async function repertorioRoutes(app: FastifyInstance) {
  
  // ==========================================
  // ROTA PÚBLICA (Qualquer um pode ver o repertório)
  // ==========================================
  app.get('/repertorio', (req, rep) => repertorioController.getSongs(req, rep));

  // ==========================================
  // ROTAS PROTEGIDAS (Apenas Líderes / Admin logados)
  // ==========================================
  app.register(async (protectedApp) => {
    
    // Trava de Segurança JWT
    protectedApp.addHook('onRequest', async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        return reply.status(401).send({ error: 'Acesso negado. Faça login.' });
      }
    });

    protectedApp.post('/repertorio', (req, rep) => repertorioController.createSong(req, rep));
    protectedApp.put('/repertorio/:id', (req, rep) => repertorioController.updateSong(req, rep));
    protectedApp.delete('/repertorio/:id', (req, rep) => repertorioController.deleteSong(req, rep));
  });
}