// src/modules/members/member.service.ts
import { prisma } from '../../shared/database/prisma.js';
import { MemberBodyType } from './member.schemas.js';

export class MemberService {

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

    return members.map(m => ({
      id: m.id,
      name: m.name,
      phone: m.phone,
      role: m.role, teamName: m.team?.name, // 👈 INCLUI O ROLE NO RETORNO
      ministry: m.ministry?.name || 'Geral',
      createdAt: m.created_at
    }));
  }

  async createMember(data: MemberBodyType) {
    const ministryId = await this.getMinistryId(data.ministry);

    const member = await prisma.member.create({
      data: {
        name: data.name,
        phone: data.phone ?? null,
        role: data.role ?? null,
        team_id: data.team ?? null,
        ministry_id: ministryId
      },
      include: { ministry: true, team: true}
    });

    return {
      id: member.id,
      name: member.name,
      phone: member.phone,
      role: member.role, // 👈 RETORNA
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
      phone: data.phone ?? null,
      role: data.role ?? null,
      team_id: data.team ?? null, // 👈 SALVAR A EQUIPA
      ministry_id: ministryId
      },
      include: { ministry: true, team: true }
    });

    return {
      id: member.id,
      name: member.name,
      phone: member.phone,
      role: member.role, // 👈 RETORNA
      ministry: member.ministry?.name,
      createdAt: member.created_at
    };
  }
  
  async deleteMember(id: string) {
    await prisma.shiftAssignment.deleteMany({
      where: { member_id: id }
    });

    await prisma.member.delete({
      where: { id }
    });

    return { success: true };
  }
}