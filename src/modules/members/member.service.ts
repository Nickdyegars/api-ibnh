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
    const members: any[] = await prisma.member.findMany({
      include: {
        ministry: true,
        team: true,
        areas: { include: { area: true } }
      },
      orderBy: { name: 'asc' }
    });

    return members.map(m => ({
      id: m.id,
      name: m.name,
      email: m.email,
      phone: m.phone,
      role: m.role,
      teamName: m.team?.name,
      ministry: m.ministry?.name || 'Geral',
      createdAt: m.created_at,
      is_active: m.is_active,
      areas: m.areas ? m.areas.map((ma: any) => ({ id: ma.area.id, name: ma.area.name })) : []
    }));
  }

  async createMember(data: any) {
    const ministryId = await this.getMinistryId(data.ministry);

    // 1. Monta o objeto apenas com os dados que existem
    const payload: any = {
      name: data.name,
      email: data.email || null,
      phone: data.phone ?? null,
      role: data.role ?? null,
      team_id: data.team ?? null,
      ministry_id: ministryId,
      is_active: data.is_active ?? true
    };

    // 2. Só cria a relação se o usuário tiver selecionado alguma área
    if (data.areas && data.areas.length > 0) {
      payload.areas = {
        create: data.areas.map((areaId: string) => ({
          area_id: areaId
        }))
      };
    }

    // 3. Tipamos como ': any' para o TypeScript aceitar os includes sem erro de cache
    const member: any = await prisma.member.create({
      data: payload,
      include: { ministry: true, team: true, areas: { include: { area: true } } }
    });

    return {
      id: member.id,
      name: member.name,
      email: member.email,
      phone: member.phone,
      role: member.role,
      ministry: member.ministry?.name,
      createdAt: member.created_at,
      s_active: member.is_active,
      areas: member.areas ? member.areas.map((ma: any) => ({ id: ma.area.id, name: ma.area.name })) : []
    };
  }

  async updateMember(id: string, data: any) {
    const ministryId = await this.getMinistryId(data.ministry);

    // 1. Limpa as áreas antigas do membro (para não duplicar)
    await prisma.memberArea.deleteMany({
      where: { member_id: id }
    });

    // 2. Prepara os novos dados
    const payload: any = {
      name: data.name,
      phone: data.phone ?? null,
      email: data.email ?? null,
      role: data.role ?? null,
      team_id: data.team ?? null,
      ministry_id: ministryId,
      is_active: data.is_active ?? true
    };

    // 3. Adiciona as novas áreas, se houver
    if (data.areas && data.areas.length > 0) {
      payload.areas = {
        create: data.areas.map((areaId: string) => ({
          area_id: areaId
        }))
      };
    }

    // 4. Executa a atualização
    const member: any = await prisma.member.update({
      where: { id },
      data: payload,
      include: { ministry: true, team: true, areas: { include: { area: true } } }
    });

    return {
      id: member.id,
      name: member.name,
      email: member.email,
      phone: member.phone,
      role: member.role,
      ministry: member.ministry?.name,
      createdAt: member.created_at,
      s_active: member.is_active,
      areas: member.areas ? member.areas.map((ma: any) => ({ id: ma.area.id, name: ma.area.name })) : []
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