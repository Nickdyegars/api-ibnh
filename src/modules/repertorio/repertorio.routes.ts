import { FastifyInstance } from 'fastify';
import { repertorioController } from './repertorio.controller.js';

export async function repertorioRoutes(app: FastifyInstance) {
  
  // ROTA PÚBLICA (Visualização do Repertório)
  app.get('/', (req, rep) => repertorioController.getSongs(req, rep));

  // ROTAS PROTEGIDAS (Apenas usuários autorizados)
  app.register(async (protectedApp) => {
    
    protectedApp.addHook('onRequest', async (request, reply) => {
      try {
        await request.jwtVerify();
        const requester = request.user as any;
        
        // CORREÇÃO: Permite Nível 0 (Super Admin) e Nível 2 (Líderes/Secretaria) gerenciarem as músicas
        if (requester.level !== 0 && requester.level !== 2) {
          return reply.status(403).send({ 
            error: 'Acesso negado. Você não tem permissão para gerenciar o repertório.' 
          });
        }
      } catch (err) {
        return reply.status(401).send({ error: 'Sessão inválida. Faça login.' });
      }
    });

    protectedApp.post('/', (req, rep) => repertorioController.createSong(req, rep));
    protectedApp.put('/:id', (req, rep) => repertorioController.updateSong(req, rep));
    protectedApp.delete('/:id', (req, rep) => repertorioController.deleteSong(req, rep));
  });
}