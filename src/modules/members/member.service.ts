// src/modules/members/member.service.ts
import { prisma } from '../../shared/database/prisma.js';
import { MemberBodyType } from './member.schemas.js';

export class MemberService {

  // Função auxiliar para achar o ID do ministério pelo nome (ou criar se não existir)
  private async getMinistryId(ministryName: string) {
    const ministry = await prisma.ministry.upsert({
      where: { name: ministryName },
      update: {},
      create: { name: ministryName }
    });
    return ministry.id;
  }

  async getAllMembers() {
    const members = await prisma.member.findMany({
      include: { ministry: true },
      orderBy: { name: 'asc' }
    });

    // Formata a resposta para ficar igual ao que vinha do Firebase
    return members.map(m => ({
      id: m.id,
      name: m.name,
      phone: m.phone,
      ministry: m.ministry?.name || 'Geral',
      createdAt: m.created_at
    }));
  }

  async createMember(data: MemberBodyType) {
    const ministryId = await this.getMinistryId(data.ministry);

    const member = await prisma.member.create({
      data: {
        name: data.name,
        // CORREÇÃO: Se phone for undefined, converte para null pro Prisma aceitar
        phone: data.phone ?? null,
        ministry_id: ministryId
      },
      // Garante que o Prisma traga o objeto do ministério junto
      include: { ministry: true }
    });

    return {
      id: member.id,
      name: member.name,
      phone: member.phone,
      ministry: member.ministry?.name,
      createdAt: member.created_at
    };
  }

  async updateMember(id: string, data: MemberBodyType) {
    const ministryId = await this.getMinistryId(data.ministry);

    const member = await prisma.member.update({
      where: { id },
      data: {
        name: data.name,
        // CORREÇÃO: Se phone for undefined, converte para null pro Prisma aceitar
        phone: data.phone ?? null,
        ministry_id: ministryId
      },
      // Garante que o Prisma traga o objeto do ministério junto
      include: { ministry: true }
    });

    return {
      id: member.id,
      name: member.name,
      phone: member.phone,
      ministry: member.ministry?.name,
      createdAt: member.created_at
    };
  }
  async deleteMember(id: string) {
    // 1. Primeiro, removemos o membro de todas as escalas em que ele estiver escalado
    await prisma.shiftAssignment.deleteMany({
      where: { member_id: id }
    });

    // 2. Agora sim, apagamos o cadastro do membro em segurança
    await prisma.member.delete({
      where: { id }
    });

    return { success: true };
  }
}