import { FastifyInstance } from 'fastify';
import { CommunityBusinessController } from './community-business.controller.js';

export async function communityBusinessRoutes(app: FastifyInstance) {
  const controller = new CommunityBusinessController();

  // === ROTAS PÚBLICAS (Livre para o Site) ===
  // A URL final no navegador/front será: /v1/community-business/public
  app.get('/public', (req, rep) => controller.getPublic(req, rep));
  app.post('/public/:id/click', (request, reply) => controller.registerClick(request, reply));
  app.post('/public/upload', (req, rep) => controller.uploadLogo(req, rep));
  app.post('/public/register', (req, rep) => controller.registerPublic(req, rep));

  // === ROTAS PRIVADAS (Requer Login no Painel) ===
  app.register(async function privateRoutes(childApp) {
    
    // 👇 O HOOK DE SEGURANÇA MÁXIMA 👇
    childApp.addHook('onRequest', async (request, reply) => {
      try {
        await request.jwtVerify();
        const requester = request.user as any;
        
        // APENAS ADMINS podem aprovar, editar ou deletar negócios
        if (requester.level !== 0) {
          return reply.status(403).send({ 
            error: 'Acesso negado. Apenas administradores podem gerenciar o Guia de Empreendedores.' 
          });
        }
      } catch (err) {
        return reply.status(401).send({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
      }
    });

    // CRUD do Painel (Agora 100% blindado)
    // A URL final no navegador/front será: /v1/community-business
    childApp.get('/', (req, rep) => controller.getAllCms(req, rep));
    childApp.post('/', (req, rep) => controller.create(req, rep));
    childApp.put('/:id', (req, rep) => controller.update(req, rep));
    childApp.delete('/:id', (req, rep) => controller.delete(req, rep));
    childApp.post('/upload', (req, rep) => controller.uploadLogo(req, rep));
  });
}