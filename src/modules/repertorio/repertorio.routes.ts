import { FastifyInstance } from 'fastify';
import { repertorioController } from './repertorio.controller.js';

export async function repertorioRoutes(app: FastifyInstance) {
  
  // ==========================================
  // ROTA PÚBLICA (Qualquer um pode ver o repertório)
  // ==========================================
  app.get('/', (req, rep) => repertorioController.getSongs(req, rep));

  // ==========================================
  // ROTAS PROTEGIDAS (Apenas Admin logados)
  // ==========================================
  app.register(async (protectedApp) => {
    
    // 👇 Trava de Segurança Máxima (Token + Nível) 👇
    protectedApp.addHook('onRequest', async (request, reply) => {
      try {
        await request.jwtVerify();
        const requester = request.user as any;
        
        // APENAS ADMINS (Nível 0) gerenciam o repertório
        if (requester.level !== 0) {
          return reply.status(403).send({ 
            error: 'Acesso negado. Apenas administradores podem gerenciar o repertório.' 
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