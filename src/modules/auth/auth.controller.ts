import { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from './auth.service.js';
import { registerSchema, loginSchema, updateUserSchema, firstAccessPasswordSchema } from './auth.schemas.js';
import { AuditService } from '../../shared/services/audit/audit.service.js';
import { prisma } from '../../shared/database/prisma.js';

const authService = new AuthService();

export class AuthController {

  async register(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      const requesterLevel = Number(requester.level ?? requester.user_level ?? 2);

      // Apenas Admin Geral (0) e Admin de Congregação (1) podem cadastrar usuários
      if (requesterLevel > 1) {
        return reply.status(403).send({ error: 'Acesso negado. Apenas administradores podem criar novos usuários.' });
      }

      const data = registerSchema.parse(request.body);

      // Trava para Admin de Congregação (1):
      // Só pode criar líderes (2) ou voluntários (3) na sua PRÓPRIA congregação
      if (requesterLevel === 1) {
        if (['admin', 'admin_geral', 'admin_congregacao'].includes(data.role)) {
          return reply.status(403).send({ error: 'Você só tem permissão para cadastrar Líderes de Ministério ou Voluntários.' });
        }
        data.congregation_id = requester.congregation_id;
      }

      const user = await authService.register(data);

      AuditService.log(
        requester.sub,
        'CREATE',
        'USER',
        user.id,
        { email: user.email, level: user.user_level, congregation_id: user.congregation_id }
      );

      return reply.status(201).send({
        message: 'Usuário criado com sucesso!',
        user: {
          id: user.id,
          email: user.email,
          name: user.profile?.full_name,
          level: user.user_level,
          ministry: user.ministry_access,
          congregation_id: user.congregation_id,
          congregation: user.congregation
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

      let roleName = 'voluntario';
      if (user.user_level === 0) roleName = 'admin_geral';
      else if (user.user_level === 1) roleName = 'admin_congregacao';
      else if (user.user_level === 2) roleName = 'lider_ministerio';

      const token = await reply.jwtSign({
        sub: user.id,
        email: user.email,
        level: user.user_level,
        user_level: user.user_level,
        role: roleName,
        ministry_access: user.ministry_access,
        congregation_id: user.congregation_id,
        custom_permissions: (user as any).custom_permissions || []
      });

      AuditService.log(
        user.id,
        'LOGIN',
        'AUTH',
        user.id,
        { email: user.email }
      );

      return reply.send({
        token,
        user: {
          id: user.id,
          name: (user as any).profile?.full_name || user.email.split('@')[0],
          email: user.email,
          level: user.user_level,
          user_level: user.user_level,
          role: roleName,
          ministry_access: user.ministry_access,
          congregation_id: user.congregation_id,
          congregation: (user as any).congregation,
          custom_permissions: (user as any).custom_permissions || [],
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

  async getMe(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      if (!requester || !requester.sub) {
        return reply.status(401).send({ error: 'Não autorizado.' });
      }

      const user = await prisma.user.findUnique({
        where: { id: requester.sub },
        include: {
          profile: true,
          congregation: { select: { id: true, name: true, is_main: true } }
        }
      });

      if (!user) {
        return reply.status(404).send({ error: 'Usuário não encontrado.' });
      }

      let roleName = 'voluntario';
      if (user.user_level === 0) roleName = 'admin_geral';
      else if (user.user_level === 1) roleName = 'admin_congregacao';
      else if (user.user_level === 2) roleName = 'lider_ministerio';

      return reply.send({
        user: {
          id: user.id,
          name: (user as any).profile?.full_name || user.email.split('@')[0],
          email: user.email,
          level: user.user_level,
          user_level: user.user_level,
          role: roleName,
          ministry_access: user.ministry_access,
          congregation_id: user.congregation_id,
          congregation: (user as any).congregation,
          custom_permissions: (user as any).custom_permissions || [],
          mustChangePassword: user.must_change_password
        }
      });
    } catch (error: any) {
      return reply.status(500).send({ error: 'Erro ao carregar dados do usuário.' });
    }
  }

  async updateFirstPassword(request: FastifyRequest, reply: FastifyReply) {
    try {
      const user = request.user as any;
      const { newPassword } = firstAccessPasswordSchema.parse(request.body);

      await authService.updateFirstPassword(user.sub, newPassword);

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
      const requesterLevel = Number(requester.level ?? requester.user_level ?? 2);

      if (requesterLevel > 1) {
        return reply.status(403).send({ error: 'Acesso negado. Apenas administradores podem listar os usuários do sistema.' });
      }

      // Se for Admin de Congregação (1), só lista usuários da sua congregação
      const filterCongregation = requesterLevel === 1 ? requester.congregation_id : undefined;
      const users = await authService.getUsers(filterCongregation);
      return reply.send(users);
    } catch (error: any) {
      return reply.status(500).send({ error: 'Erro ao buscar usuários do banco de dados.' });
    }
  }

  async updateUser(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const requester = request.user as any;
      const requesterLevel = Number(requester.level ?? requester.user_level ?? 2);

      const targetUser = await prisma.user.findUnique({ where: { id } });
      if (!targetUser) {
        return reply.status(404).send({ error: 'Usuário não encontrado.' });
      }

      // Próprio usuário editando seu perfil
      if (requester.sub === id) {
        const data = updateUserSchema.parse(request.body);
        delete data.role;
        delete data.ministry;
        delete data.congregation_id;
        const user = await authService.updateUser(id, data);
        return reply.send({ message: 'Perfil atualizado com sucesso!', user });
      }

      // Se não for o próprio usuário, precisa ser nível 0 ou 1
      if (requesterLevel > 1) {
        return reply.status(403).send({ error: 'Acesso negado. Você só pode atualizar o seu próprio perfil.' });
      }

      const data = updateUserSchema.parse(request.body);

      // Trava para Admin de Congregação (1)
      if (requesterLevel === 1) {
        if (targetUser.congregation_id !== requester.congregation_id || targetUser.user_level < 2) {
          return reply.status(403).send({ error: 'Você não tem permissão para alterar este usuário.' });
        }
        if (data.role && ['admin', 'admin_geral', 'admin_congregacao'].includes(data.role)) {
          return reply.status(403).send({ error: 'Você não tem permissão para conceder este nível de acesso.' });
        }
        data.congregation_id = requester.congregation_id;
      }

      const user = await authService.updateUser(id, data);

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
      const requesterLevel = Number(requester.level ?? requester.user_level ?? 2);

      if (requesterLevel > 1) {
        return reply.status(403).send({ error: 'Acesso negado. Apenas administradores podem excluir usuários.' });
      }

      if (requester.sub === id) {
        return reply.status(400).send({ error: 'Você não pode excluir sua própria conta por segurança.' });
      }

      const targetUser = await prisma.user.findUnique({ where: { id } });
      if (!targetUser) {
        return reply.status(404).send({ error: 'Usuário não encontrado.' });
      }

      // Admin de congregação só pode excluir líderes e voluntários da sua própria congregação
      if (requesterLevel === 1) {
        if (targetUser.congregation_id !== requester.congregation_id || targetUser.user_level < 2) {
          return reply.status(403).send({ error: 'Você não tem permissão para excluir este usuário.' });
        }
      }

      await authService.deleteUser(id);

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
