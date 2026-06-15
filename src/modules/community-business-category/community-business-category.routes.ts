// src/modules/community-business-category/community-business-category.routes.ts
import { FastifyInstance } from 'fastify';
import { CommunityBusinessCategoryController } from './community-business-category.controller.js';

export async function communityBusinessCategoryRoutes(app: FastifyInstance) {
  const controller = new CommunityBusinessCategoryController();

  // ROTA PÚBLICA (Usada para preencher o <select> no site)
  app.get('/public', (req, rep) => controller.getPublic(req, rep));

  // ROTAS PRIVADAS (Requer Login no Painel)
  app.register(async function privateRoutes(childApp) {
    
    // 👇 O HOOK DE SEGURANÇA MÁXIMA (Token + Nível) 👇
    childApp.addHook('onRequest', async (request, reply) => {
      try {
        await request.jwtVerify();
        const requester = request.user as any;
        
        // APENAS ADMINS (Nível 0) podem ver, criar, editar ou apagar as categorias no CMS
        if (requester.level !== 0) {
          return reply.status(403).send({ 
            error: 'Acesso negado. Apenas administradores podem gerenciar as categorias de negócios.' 
          });
        }
      } catch (err) {
        return reply.status(401).send({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
      }
    });

    childApp.get('/', (req, rep) => controller.getAllCms(req, rep));
    childApp.post('/', (req, rep) => controller.create(req, rep));
    childApp.put('/:id', (req, rep) => controller.update(req, rep));
    childApp.delete('/:id', (req, rep) => controller.delete(req, rep));
  });
}