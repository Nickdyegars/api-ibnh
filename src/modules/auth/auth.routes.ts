// auth.routes.ts (NO BACKEND)
import { FastifyInstance } from 'fastify';
import { AuthController } from './auth.controller.js';

export async function authRoutes(app: FastifyInstance) {
  const authController = new AuthController();

  // LOGIN É PÚBLICO
  app.post('/login', (req, rep) => authController.login(req, rep));

  // CADASTRO É PRIVADO (Requer Token do Admin)
  app.register(async function privateRoutes(childApp) {
    
    // O Cadeado JWT
    childApp.addHook('onRequest', async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        return reply.status(401).send({ error: 'Acesso negado. Apenas administradores podem criar usuários.' });
      }
    });

    // A rota de criação fica protegida!
    childApp.post('/register', (req, rep) => authController.register(req, rep));
    childApp.get('/users', (req, rep) => authController.getUsers(req, rep));
    childApp.put('/users/:id', (req, rep) => authController.updateUser(req, rep));
    childApp.delete('/users/:id', (req, rep) => authController.deleteUser(req, rep));
  });
}