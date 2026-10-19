import { FastifyReply, FastifyRequest } from 'fastify';
import { CongregationService } from './congregation.service.js';
import { createCongregationSchema, updateCongregationSchema } from './congregation.schemas.js';
import { AuditService } from '../../shared/services/audit/audit.service.js';

const congregationService = new CongregationService();

export class CongregationController {
  async list(request: FastifyRequest, reply: FastifyReply) {
    try {
      const query = request.query as { active?: string };
      const onlyActive = query.active === 'true';
      const congregations = await congregationService.list(onlyActive);
      return reply.send(congregations);
    } catch (error: any) {
      return reply.status(500).send({ error: error.message || 'Erro ao listar congregações.' });
    }
  }

  async getById(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const congregation = await congregationService.getById(id);
      return reply.send(congregation);
    } catch (error: any) {
      return reply.status(404).send({ error: error.message || 'Congregação não encontrada.' });
    }
  }

  async create(request: FastifyRequest, reply: FastifyReply) {
    try {
      const user = request.user as any;
      if (user.level !== 0 && user.user_level !== 0) {
        return reply.status(403).send({ error: 'Acesso negado. Apenas Administradores podem cadastrar congregações.' });
      }

      const rawBody = request.body as any;
      const bodyData = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
      const parsedData = createCongregationSchema.parse(bodyData);

      const newCongregation = await congregationService.create(parsedData);

      AuditService.log(user.sub || user.id, 'CREATE', 'CONGREGATION', newCongregation.id, {
        name: newCongregation.name,
        is_main: newCongregation.is_main
      });

      return reply.status(201).send(newCongregation);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  }

  async update(request: FastifyRequest, reply: FastifyReply) {
    try {
      const user = request.user as any;
      if (user.level !== 0 && user.user_level !== 0) {
        return reply.status(403).send({ error: 'Acesso negado. Apenas Administradores podem editar congregações.' });
      }

      const { id } = request.params as { id: string };
      const rawBody = request.body as any;
      const bodyData = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
      const parsedData = updateCongregationSchema.parse(bodyData);

      const updated = await congregationService.update(id, parsedData);

      AuditService.log(user.sub || user.id, 'UPDATE', 'CONGREGATION', id, parsedData);

      return reply.send(updated);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  }

  async delete(request: FastifyRequest, reply: FastifyReply) {
    try {
      const user = request.user as any;
      if (user.level !== 0 && user.user_level !== 0) {
        return reply.status(403).send({ error: 'Acesso negado. Apenas Administradores podem excluir congregações.' });
      }

      const { id } = request.params as { id: string };
      await congregationService.delete(id);

      AuditService.log(user.sub || user.id, 'DELETE', 'CONGREGATION', id);

      return reply.send({ message: 'Congregação excluída com sucesso.' });
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  }
}
