import { FastifyReply, FastifyRequest } from 'fastify';
import { MinistryAreaService } from './area.service.js'; // O service que criamos antes
import { areaBodySchema } from './area.schemas.js';
import { AuditService } from '../../shared/services/audit/audit.service.js';

const areaService = new MinistryAreaService();

export class AreaController {

  async list(request: FastifyRequest, reply: FastifyReply) {
    try {
      // Pega o filtro da query (ex: ?ministry=Multimídia)
      const { ministry } = request.query as { ministry: string };
      const areas = await areaService.getAreas(ministry);
      return reply.send(areas);
    } catch (error: any) {
      return reply.status(500).send({ error: 'Erro ao buscar áreas' });
    }
  }

  async create(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      const data = areaBodySchema.parse(request.body);

      // 👇 TRAVA DE SEGURANÇA INTER-MINISTÉRIO 👇
      if (requester.level !== 0 && requester.ministry_access !== 'all') {
        if (data.ministry !== requester.ministry_access) {
          return reply.status(403).send({ 
            error: `Acesso negado. Você só tem permissão para adicionar áreas no ministério: ${requester.ministry_access}.` 
          });
        }
      }

      const newArea = await areaService.createArea(data.name, data.ministry) as any;

      // 📝 LOG: Criação de nova área (ex: Projeção, Câmera)
      AuditService.log(requester.sub, 'CREATE', 'MINISTRY_AREA', newArea?.id, data);

      return reply.status(201).send(newArea);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  }

  async delete(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      const { id } = request.params as { id: string };

      // 👇 TRAVA DE EXCLUSÃO 👇
      if (requester.level !== 0) {
         return reply.status(403).send({ error: 'Acesso negado. Apenas administradores podem excluir áreas do banco de dados.' });
      }

      await areaService.deleteArea(id);

      // 📝 LOG: Exclusão de área
      AuditService.log(requester.sub, 'DELETE', 'MINISTRY_AREA', id);

      return reply.send({ message: 'Área apagada com sucesso' });
    } catch (error: any) {
      console.error("🔥 Erro ao deletar área no banco:", error);
      return reply.status(400).send({ error: 'Erro ao apagar área' });
    }
  }
}