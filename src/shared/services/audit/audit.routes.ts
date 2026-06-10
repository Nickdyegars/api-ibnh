import { FastifyInstance } from 'fastify';
import { AuditController } from './audit.controller.js';

const auditController = new AuditController();

export async function auditRoutes(app: FastifyInstance) {
    
    // Rota GET /audit
    // Protegida pelo middleware de autenticação (ajuste o nome do seu middleware/hook caso seja diferente, ex: app.verifyJwt)

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
    
        protectedApp.get('/audit', (req, rep) => auditController.getLogs(req, rep));
      });

}