import { FastifyInstance } from 'fastify';
import { AuthController } from './auth.controller.js';

export async function authRoutes(app: FastifyInstance) {
  const authController = new AuthController();

  // Para não perder o contexto do 'this' na classe, usamos arrow functions
  app.post('/register', (req, rep) => authController.register(req, rep));
  app.post('/login', (req, rep) => authController.login(req, rep));
}