import { FastifyInstance } from 'fastify';
import { repertorioController } from './repertorio.controller.js';

export async function repertorioRoutes(app: FastifyInstance) {
  
  // ROTAS PÚBLICAS (Visualização)
  app.get('/', (req, rep) => repertorioController.getSongs(req, rep));
  app.get('/tags', (req, rep) => repertorioController.getTags(req, rep)); // Lista os filtros

  // ROTAS PROTEGIDAS (Gerenciamento)
  app.register(async (protectedApp) => {
    
    protectedApp.addHook('onRequest', async (request, reply) => {
      try {
        await request.jwtVerify();
        const requester = request.user as any;
        
        const requesterLevel = Number(requester?.level ?? requester?.user_level ?? 3);
        const ministry = (requester?.ministry_access || '').toLowerCase();
        const isLouvor = ministry === 'louvor';
        const hasCustom = Array.isArray(requester?.custom_permissions) && requester.custom_permissions.includes('repertorio');

        if (requesterLevel > 2 && !isLouvor && !hasCustom) {
          return reply.status(403).send({ 
            error: 'Acesso negado. Você não tem permissão para gerenciar o repertório.' 
          });
        }
      } catch (err) {
        return reply.status(401).send({ error: 'Sessão inválida. Faça login.' });
      }
    });

    // CRUD de Músicas
    protectedApp.post('/', (req, rep) => repertorioController.createSong(req, rep));
    protectedApp.put('/:id', (req, rep) => repertorioController.updateSong(req, rep));
    protectedApp.delete('/:id', (req, rep) => repertorioController.deleteSong(req, rep));

    // CRUD de Tags
    protectedApp.post('/tags', (req, rep) => repertorioController.createTag(req, rep));
    protectedApp.put('/tags/:id', (req, rep) => repertorioController.updateTag(req, rep));
    protectedApp.delete('/tags/:id', (req, rep) => repertorioController.deleteTag(req, rep));
  });
}