import { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from './auth.service.js';
import { registerSchema, loginSchema, updateUserSchema, firstAccessPasswordSchema } from './auth.schemas.js';
// 👇 1. Importando o nosso serviço de Auditoria 👇
import { AuditService } from '../../shared/services/audit/audit.service.js'; 

const authService = new AuthService();

export class AuthController {

  async register(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      if (requester.level !== 0) {
        return reply.status(403).send({ error: 'Acesso negado. Apenas administradores podem criar novos usuários.' });
      }

      const data = registerSchema.parse(request.body);
      const user = await authService.register(data);

      // 📝 LOG DE AUDITORIA: Quem criou e quem foi criado
      AuditService.log(
        requester.sub,                 // Quem fez (Admin)
        'CREATE',                      // Ação
        'USER',                        // Onde
        user.id,                       // ID do novo usuário criado
        { email: user.email, level: user.user_level } // O que foi criado
      );

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

      // 📝 LOG DE AUDITORIA: Como no login não temos request.user ainda (pois ele está entrando agora), usamos o ID do próprio usuário retornado pelo banco.
      AuditService.log(
        user.id,                       // O próprio usuário
        'LOGIN',                       // Ação
        'AUTH',                        // Onde
        user.id,                       // ID do recurso
        { email: user.email }          // Detalhes extras
      );

      return reply.send({
        token,
        user: {
          id: user.id,
          email: user.email,
          level: user.user_level,
          ministry_access: user.ministry_access,
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

  async updateFirstPassword(request: FastifyRequest, reply: FastifyReply) {
    try {
      const user = request.user as any;
      const { newPassword } = firstAccessPasswordSchema.parse(request.body);

      await authService.updateFirstPassword(user.sub, newPassword);

      // 📝 LOG DE AUDITORIA: Usuário trocou a senha padrão
      AuditService.log(
        user.sub,
        'UPDATE_FIRST_PASSWORD',
        'AUTH',
        user.sub
      );

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
      const requester = request.user as any;

      if (requester.level !== 0 && requester.sub !== id) {
        return reply.status(403).send({ error: 'Acesso negado. Você só pode atualizar o seu próprio perfil.' });
      }

      const data = updateUserSchema.parse(request.body);

      if (requester.level !== 0) {
        delete data.role;
        delete data.ministry;
      }

      const user = await authService.updateUser(id, data);

      // 📝 LOG DE AUDITORIA: Edição de dados
      // Passamos o "data" no detalhe para saber exatamente quais campos foram alterados!
      AuditService.log(
        requester.sub,
        'UPDATE',
        'USER',
        id,
        data 
      );

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
      const requester = request.user as any;

      if (requester.level !== 0) {
        return reply.status(403).send({ error: 'Acesso negado. Apenas administradores podem excluir usuários.' });
      }

      if (requester.sub === id) {
        return reply.status(400).send({ error: 'Você não pode excluir sua própria conta por segurança.' });
      }

      await authService.deleteUser(id);

      // 📝 LOG DE AUDITORIA: Conta apagada (Extremamente importante)
      AuditService.log(
        requester.sub,
        'DELETE',
        'USER',
        id
      );

      return reply.send({ message: 'Usuário apagado com sucesso!' });
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  }
}