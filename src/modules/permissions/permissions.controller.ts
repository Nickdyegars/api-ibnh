// src/modules/permissions/permissions.controller.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { PermissionsService } from './permissions.service.js';
import { AuditService } from '../../shared/services/audit/audit.service.js';

const permissionsService = new PermissionsService();

export class PermissionsController {
  // Retorna a matriz de permissões atual por cargo
  async getRolePermissions(request: FastifyRequest, reply: FastifyReply) {
    try {
      const role_permissions = await permissionsService.getRolePermissions();
      return reply.send({ role_permissions });
    } catch (error: any) {
      return reply.status(500).send({ error: error.message || 'Erro ao buscar permissões do sistema.' });
    }
  }

  // Atualiza a matriz de permissões dos cargos (Exclusivo Admin Geral)
  async updateRolePermissions(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as { sub: string; email: string; level?: number };
      const requesterLevel = Number(requester?.level ?? 3);

      if (requesterLevel !== 0) {
        return reply.status(403).send({ error: 'Apenas o Administrador Geral pode alterar as configurações de permissões do sistema.' });
      }

      const body = request.body as { role_permissions: Record<string, string[]> };
      if (!body || !body.role_permissions) {
        return reply.status(400).send({ error: 'role_permissions é obrigatório.' });
      }

      const updated = await permissionsService.updateRolePermissions(body.role_permissions);

      AuditService.log(
        requester.sub,
        'UPDATE',
        'SYSTEM_PERMISSIONS',
        'default',
        { role_permissions: updated }
      );

      return reply.send({
        message: 'Permissões dos cargos atualizadas com sucesso!',
        role_permissions: updated
      });
    } catch (error: any) {
      return reply.status(500).send({ error: error.message || 'Erro ao atualizar permissões dos cargos.' });
    }
  }

  // Atualiza as permissões extras concedidas a um usuário específico (Exclusivo Admin Geral)
  async updateUserCustomPermissions(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as { sub: string; email: string; level?: number };
      const requesterLevel = Number(requester?.level ?? 3);

      if (requesterLevel !== 0) {
        return reply.status(403).send({ error: 'Apenas o Administrador Geral pode liberar recursos extras para usuários.' });
      }

      const { userId } = request.params as { userId: string };
      const body = request.body as { custom_permissions: string[] };

      if (!userId) {
        return reply.status(400).send({ error: 'ID do usuário é obrigatório.' });
      }

      const updatedUser = await permissionsService.updateUserCustomPermissions(
        userId,
        body.custom_permissions || []
      );

      AuditService.log(
        requester.sub,
        'UPDATE',
        'USER_PERMISSIONS',
        userId,
        { custom_permissions: body.custom_permissions }
      );

      return reply.send({
        message: 'Permissões do usuário atualizadas com sucesso!',
        user: updatedUser
      });
    } catch (error: any) {
      return reply.status(500).send({ error: error.message || 'Erro ao atualizar permissões do usuário.' });
    }
  }

  // Busca as permissões extras de um usuário
  async getUserCustomPermissions(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as { sub: string; email: string; level?: number };
      const requesterLevel = Number(requester?.level ?? 3);
      const { userId } = request.params as { userId: string };

      if (requesterLevel !== 0 && requester?.sub !== userId) {
        return reply.status(403).send({ error: 'Acesso negado.' });
      }

      const data = await permissionsService.getUserCustomPermissions(userId);
      return reply.send(data);
    } catch (error: any) {
      return reply.status(500).send({ error: error.message || 'Erro ao buscar permissões do usuário.' });
    }
  }
}
