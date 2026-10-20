// src/modules/permissions/permissions.routes.ts
import { FastifyInstance } from 'fastify';
import { PermissionsController } from './permissions.controller.js';

export async function permissionsRoutes(app: FastifyInstance) {
  const controller = new PermissionsController();

  // ROTA PÚBLICA/AUTENTICADA: busca as permissões vigentes
  app.get('/', (req, rep) => controller.getRolePermissions(req, rep));

  // ROTAS PRIVADAS
  app.register(async function privateRoutes(childApp) {
    childApp.addHook('onRequest', async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        return reply.status(401).send({ error: 'Não autorizado.' });
      }
    });

    // Atualiza permissões dos cargos (Exclusivo Admin Geral)
    childApp.put('/roles', (req, rep) => controller.updateRolePermissions(req, rep));

    // Busca permissões extras de um usuário
    childApp.get('/users/:userId', (req, rep) => controller.getUserCustomPermissions(req, rep));

    // Atualiza permissões extras de um usuário (Exclusivo Admin Geral)
    childApp.put('/users/:userId', (req, rep) => controller.updateUserCustomPermissions(req, rep));
  });
}
