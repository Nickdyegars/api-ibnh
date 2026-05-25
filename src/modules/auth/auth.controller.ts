import { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from './auth.service.js';
import { registerSchema, loginSchema, updateUserSchema, firstAccessPasswordSchema } from './auth.schemas.js';

const authService = new AuthService();

export class AuthController {

  async register(request: FastifyRequest, reply: FastifyReply) {
    try {
      // 👇 TRAVA DE SEGURANÇA MÁXIMA 👇
      const requester = request.user as any;
      if (requester.level !== 0) {
        return reply.status(403).send({ error: 'Acesso negado. Apenas administradores podem criar novos usuários.' });
      }

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
      if (error.name === 'ZodError') {
        return reply.status(400).send({ error: error.errors[0].message });
      }
      return reply.status(400).send({ error: error.message });
    }
  }

  async login(request: FastifyRequest, reply: FastifyReply) {
    try {
      const data = loginSchema.parse(request.body);
      const user = await authService.login(data);

      const token = await reply.jwtSign({
        sub: user.id,
        email: user.email,
        level: user.user_level,
        ministry_access: user.ministry_access
      });

      return reply.send({
        token,
        user: {
          id: user.id,
          email: user.email,
          level: user.user_level,
          ministry_access: user.ministry_access,
          // 👇 INCLUÍDA A FLAG DE TROCA DE SENHA 👇
          mustChangePassword: user.must_change_password
        }
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return reply.status(400).send({ error: error.errors[0].message });
      }
      return reply.status(401).send({ error: error.message });
    }
  }

  // 👇 NOVO MÉTODO PARA A REDEFINIÇÃO 👇
  async updateFirstPassword(request: FastifyRequest, reply: FastifyReply) {
    try {
      const user = request.user as any;
      const { newPassword } = firstAccessPasswordSchema.parse(request.body);

      await authService.updateFirstPassword(user.sub, newPassword);

      return reply.send({ message: 'Senha atualizada com sucesso!' });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return reply.status(400).send({ error: error.errors[0].message });
      }
      return reply.status(400).send({ error: error.message });
    }
  }

  async getUsers(request: FastifyRequest, reply: FastifyReply) {
    try {
      // 👇 TRAVA DE PRIVACIDADE (Apenas Admins veem a lista de todos) 👇
      const requester = request.user as any;
      if (requester.level !== 0) {
        return reply.status(403).send({ error: 'Acesso negado. Apenas administradores podem listar os usuários do sistema.' });
      }

      const users = await authService.getUsers();
      return reply.send(users);
    } catch (error: any) {
      return reply.status(500).send({ error: 'Erro ao buscar usuários do banco de dados.' });
    }
  }

  async updateUser(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const requester = request.user as any; // 👈 Puxamos os dados de quem fez a requisição

      // 1. TRAVA DE SEGURANÇA (IDOR):
      // Se não for Admin (level 0) E estiver tentando editar um ID diferente do seu próprio, BLOQUEIA.
      if (requester.level !== 0 && requester.sub !== id) {
        return reply.status(403).send({ error: 'Acesso negado. Você só pode atualizar o seu próprio perfil.' });
      }

      // Valida os dados enviados
      const data = updateUserSchema.parse(request.body);

      // 2. TRAVA DE ESCALADA DE PRIVILÉGIO:
      // Se um líder (nível > 0) estiver editando a si mesmo, ele NÃO PODE se dar permissão de Admin na marra.
      if (requester.level !== 0) {
        delete data.role;
        delete data.ministry;
      }

      const user = await authService.updateUser(id, data);

      return reply.send({ message: 'Usuário atualizado com sucesso!', user });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return reply.status(400).send({ error: error.errors[0].message });
      }
      return reply.status(400).send({ error: error.message });
    }
  }

  async deleteUser(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const requester = request.user as any; // 👈 Puxamos os dados de quem fez a requisição

      // 1. TRAVA DE SEGURANÇA (RBAC): Apenas Admins podem apagar contas
      if (requester.level !== 0) {
        return reply.status(403).send({ error: 'Acesso negado. Apenas administradores podem excluir usuários.' });
      }

      // 2. PREVENÇÃO DE AUTO-EXCLUSÃO (Opcional, mas recomendado)
      // Evita que o Admin apague o próprio usuário por acidente e perca o acesso ao sistema
      if (requester.sub === id) {
        return reply.status(400).send({ error: 'Você não pode excluir sua própria conta por segurança.' });
      }

      await authService.deleteUser(id);

      return reply.send({ message: 'Usuário apagado com sucesso!' });
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  }
}