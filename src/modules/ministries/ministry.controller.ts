import { FastifyReply, FastifyRequest } from 'fastify';
import { MinistryService } from './ministry.service.js';
import { createMinistrySchema, updateMinistrySchema } from './ministry.schemas.js';
import { AuditService } from '../../shared/services/audit/audit.service.js';

const ministryService = new MinistryService();

export class MinistryController {
  async list(request: FastifyRequest, reply: FastifyReply) {
    try {
      const ministries = await ministryService.list();
      return reply.send(ministries);
    } catch (error: any) {
      return reply.status(500).send({ error: error.message || 'Erro ao listar equipes/ministérios.' });
    }
  }

  async create(request: FastifyRequest, reply: FastifyReply) {
    try {
      const user = request.user as any;
      if (user.level !== 0) {
        return reply.status(403).send({ error: 'Acesso negado. Apenas Administradores podem criar equipes.' });
      }

      const rawBody = request.body as any;
      const bodyData = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
      const { name, color } = createMinistrySchema.parse(bodyData);

      const newMinistry = await ministryService.create(name, color);

      AuditService.log(user.sub, 'CREATE', 'MINISTRY', String(newMinistry.id), { name, color });

      return reply.status(201).send(newMinistry);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  }

  async update(request: FastifyRequest, reply: FastifyReply) {
    try {
      const user = request.user as any;
      if (user.level !== 0) {
        return reply.status(403).send({ error: 'Acesso negado. Apenas Administradores podem editar equipes.' });
      }

      const { id } = request.params as { id: string };
      const rawBody = request.body as any;
      const bodyData = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
      const { name, color } = updateMinistrySchema.parse(bodyData);

      const updated = await ministryService.update(Number(id), name, color);

      AuditService.log(user.sub, 'UPDATE', 'MINISTRY', String(id), { name, color });

      return reply.send(updated);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  }

  async delete(request: FastifyRequest, reply: FastifyReply) {
    try {
      const user = request.user as any;
      if (user.level !== 0) {
        return reply.status(403).send({ error: 'Acesso negado. Apenas Administradores podem excluir equipes.' });
      }

      const { id } = request.params as { id: string };
      const result = await ministryService.delete(Number(id));

      AuditService.log(user.sub, 'DELETE', 'MINISTRY', String(id), result);

      return reply.send(result);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  }
}
