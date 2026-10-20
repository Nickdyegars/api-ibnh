import { FastifyReply, FastifyRequest } from 'fastify';
import { MinistryAreaService } from './area.service.js';
import { areaBodySchema } from './area.schemas.js';
import { AuditService } from '../../shared/services/audit/audit.service.js';

const areaService = new MinistryAreaService();

export class AreaController {

  async list(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { ministry, congregation_id } = request.query as { ministry?: string; congregation_id?: string };
      const areas = await areaService.getAreas(ministry || '', congregation_id);
      return reply.send(areas);
    } catch (error: any) {
      return reply.status(500).send({ error: 'Erro ao buscar áreas' });
    }
  }

  async create(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      const requesterLevel = Number(requester?.level ?? requester?.user_level ?? 3);
      const data = areaBodySchema.parse(request.body);

      // Trava de perfil: Apenas Admin (0, 1) ou Líder (2) podem criar áreas
      if (requesterLevel >= 3) {
        return reply.status(403).send({ 
          error: 'Acesso negado. Apenas líderes ou administradores podem adicionar áreas.' 
        });
      }

      if (requesterLevel > 0 && requester?.congregation_id) {
        data.congregation_id = requester.congregation_id;
      }

      // Líder de ministério (nível 2)
      if (requesterLevel === 2) {
        const userMin = (requester.ministry_access || requester.ministry || '').trim().toLowerCase();
        const dataMin = (data.ministry || '').trim().toLowerCase();
        if (userMin !== 'all' && userMin !== dataMin) {
          return reply.status(403).send({ 
            error: `Acesso negado. Você só tem permissão para adicionar áreas no ministério: ${requester.ministry_access}.` 
          });
        }
      }

      const newArea = await areaService.createArea(data.name, data.ministry, data.congregation_id) as any;

      AuditService.log(requester.sub, 'CREATE', 'MINISTRY_AREA', newArea?.id, data);

      return reply.status(201).send(newArea);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  }

  async delete(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      const requesterLevel = Number(requester?.level ?? requester?.user_level ?? 3);
      const { id } = request.params as { id: string };

      if (requesterLevel >= 3) {
         return reply.status(403).send({ 
           error: 'Acesso negado. Apenas líderes ou administradores podem excluir áreas.' 
         });
      }

      await areaService.deleteArea(id);

      AuditService.log(requester.sub, 'DELETE', 'MINISTRY_AREA', id);

      return reply.send({ message: 'Área apagada com sucesso' });
    } catch (error: any) {
      console.error("🔥 Erro ao deletar área no banco:", error);
      return reply.status(400).send({ error: 'Erro ao apagar área' });
    }
  }
}
