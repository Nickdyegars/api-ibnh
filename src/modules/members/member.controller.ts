import { FastifyReply, FastifyRequest } from 'fastify';
import { MemberService } from './member.service.js';
import { memberBodySchema } from './member.schemas.js';

const memberService = new MemberService();

export class MemberController {

  async list(request: FastifyRequest, reply: FastifyReply) {
    try {
      const members = await memberService.getAllMembers();
      return reply.send(members);
    } catch (error: any) {
      return reply.status(500).send({ error: 'Erro ao buscar membros' });
    }
  }

  async create(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      const data = memberBodySchema.parse(request.body);

      // 👇 TRAVA DE SEGURANÇA INTER-MINISTÉRIO 👇
      // Se não for Admin (0), ele só pode cadastrar no próprio ministério (ou 'all' se tiver acesso total)
      if (requester.level !== 0 && requester.ministry_access !== 'all') {
        if (data.ministry !== requester.ministry_access) {
          return reply.status(403).send({ 
            error: `Acesso negado. Você só tem permissão para adicionar membros no ministério: ${requester.ministry_access}.` 
          });
        }
      }

      const newMember = await memberService.createMember(data);
      return reply.status(201).send(newMember);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  }

  async update(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      const { id } = request.params as { id: string };
      const data = memberBodySchema.parse(request.body);

      // 👇 TRAVA DE SEGURANÇA INTER-MINISTÉRIO 👇
      if (requester.level !== 0 && requester.ministry_access !== 'all') {
        if (data.ministry !== requester.ministry_access) {
           return reply.status(403).send({ 
            error: `Você só pode editar membros pertencentes ao ministério: ${requester.ministry_access}.` 
          });
        }
      }

      const updatedMember = await memberService.updateMember(id, data);
      return reply.send(updatedMember);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  }

  async delete(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      const { id } = request.params as { id: string };

      // 👇 TRAVA DE EXCLUSÃO (Recomendado: Apenas Admins podem apagar de verdade) 👇
      // Se quiser que o líder possa apagar, basta mudar para verificar o ministério
      if (requester.level !== 0) {
         return reply.status(403).send({ error: 'Acesso negado. Apenas administradores podem excluir membros do banco de dados.' });
      }

      await memberService.deleteMember(id);
      return reply.send({ message: 'Membro apagado com sucesso' });
    } catch (error: any) {
      console.error("🔥 Erro ao deletar membro no banco:", error);
      return reply.status(400).send({ error: 'Erro ao apagar membro' });
    }
  }
}