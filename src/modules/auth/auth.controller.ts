import { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from './auth.service.js';
import { registerSchema, loginSchema } from './auth.schemas.js';

const authService = new AuthService();

export class AuthController {

  async register(request: FastifyRequest, reply: FastifyReply) {
    try {
      // 1. Valida o body usando o Zod Schema
      const data = registerSchema.parse(request.body);

      // 2. Chama o Service
      const user = await authService.register(data);

      // 3. Retorna a resposta de sucesso
      return reply.status(201).send({
        message: 'Usuário criado com sucesso!',
        user: {
          id: user.id,
          email: user.email,
          name: user.profile?.full_name,
          level: user.user_level,
          ministry: user.ministry_access
        }
      });
    } catch (error: any) {
      // Se for erro do Zod (validação), formatamos a mensagem
      if (error.name === 'ZodError') {
        return reply.status(400).send({ error: error.errors[0].message });
      }
      // Se for erro do Service (ex: e-mail duplicado)
      return reply.status(400).send({ error: error.message });
    }
  }

  async login(request: FastifyRequest, reply: FastifyReply) {
    try {
      const data = loginSchema.parse(request.body);
      const user = await authService.login(data);

      // AGORA SIM: Colocamos o ministry_access dentro do Token JWT!
      const token = await reply.jwtSign({
        sub: user.id,
        email: user.email,
        level: user.user_level,
        ministry_access: user.ministry_access // <-- Faltava isso aqui
      });

      return reply.send({
        token,
        user: {
          id: user.id,
          email: user.email,
          level: user.user_level,
          ministry_access: user.ministry_access // <-- E faltava isso aqui!
        }
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return reply.status(400).send({ error: error.errors[0].message });
      }
      return reply.status(401).send({ error: error.message });
    }
  }
}