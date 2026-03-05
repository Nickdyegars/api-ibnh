// src/modules/members/member.controller.ts
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
      const data = memberBodySchema.parse(request.body);
      const newMember = await memberService.createMember(data);
      return reply.status(201).send(newMember);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  }

  async update(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const data = memberBodySchema.parse(request.body);
      const updatedMember = await memberService.updateMember(id, data);
      return reply.send(updatedMember);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  }

  async delete(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      await memberService.deleteMember(id);
      return reply.send({ message: 'Membro apagado com sucesso' });
    } catch (error: any) {
      // Adicionamos esse console.log para ver o erro exato no terminal se der ruim!
      console.error("🔥 Erro ao deletar membro no banco:", error);
      return reply.status(400).send({ error: 'Erro ao apagar membro' });
    }
  }
}