// src/modules/members/member.service.ts
import { prisma } from '../../shared/database/prisma.js';
import { MemberBodyType } from './member.schemas.js';

export class MemberService {

  private async getMinistryId(ministryName: string, congregationId?: string | null) {
    let targetCongregationId = congregationId;
    if (!targetCongregationId) {
      const sede = await prisma.congregation.findFirst({ where: { is_main: true } });
      if (sede) targetCongregationId = sede.id;
    }

    const ministry = await prisma.ministry.findFirst({
      where: {
        name: { equals: ministryName, mode: 'insensitive' },
        congregation_id: targetCongregationId || undefined
      }
    });

    if (ministry) return ministry.id;

    const newMinistry = await prisma.ministry.create({
      data: {
        name: ministryName,
        congregation_id: targetCongregationId || null
      }
    });
    return newMinistry.id;
  }

  async getAllMembers(congregationId?: string) {
    const where: any = {};
    if (congregationId) {
      where.congregation_id = congregationId;
    }

    const members: any[] = await prisma.member.findMany({
      where,
      include: {
        ministry: true,
        team: true,
        congregation: { select: { id: true, name: true, is_main: true } },
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
      congregation_id: m.congregation_id,
      congregation: m.congregation,
      createdAt: m.created_at,
      is_active: m.is_active,
      areas: m.areas ? m.areas.map((ma: any) => ({ id: ma.area.id, name: ma.area.name })) : []
    }));
  }

  async createMember(data: MemberBodyType) {
    let targetCongregationId = data.congregation_id;
    if (!targetCongregationId) {
      const sede = await prisma.congregation.findFirst({ where: { is_main: true } });
      if (sede) targetCongregationId = sede.id;
    }

    const ministryId = await this.getMinistryId(data.ministry, targetCongregationId);

    // 1. Monta o objeto apenas com os dados que existem
    const payload: any = {
      name: data.name,
      email: data.email || null,
      phone: data.phone ?? null,
      role: data.role ?? null,
      team_id: data.team ?? null,
      congregation_id: targetCongregationId || null,
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
      include: {
        ministry: true,
        team: true,
        congregation: { select: { id: true, name: true, is_main: true } },
        areas: { include: { area: true } }
      }
    });

    return {
      id: member.id,
      name: member.name,
      email: member.email,
      phone: member.phone,
      role: member.role,
      teamName: member.team?.name,
      ministry: member.ministry?.name,
      congregation_id: member.congregation_id,
      congregation: member.congregation,
      createdAt: member.created_at,
      is_active: member.is_active,
      areas: member.areas ? member.areas.map((ma: any) => ({ id: ma.area.id, name: ma.area.name })) : []
    };
  }

  async updateMember(id: string, data: MemberBodyType) {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.member.findUnique({ where: { id } });
      const targetCongregationId = data.congregation_id !== undefined ? data.congregation_id : current?.congregation_id;

      const ministryId = await this.getMinistryId(data.ministry, targetCongregationId);

      // 1. Limpa as áreas antigas do membro (para não duplicar)
      await tx.memberArea.deleteMany({
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

      if (data.congregation_id !== undefined) {
        payload.congregation_id = data.congregation_id || null;
      }

      // 3. Adiciona as novas áreas, se houver
      if (data.areas && data.areas.length > 0) {
        payload.areas = {
          create: data.areas.map((areaId: string) => ({
            area_id: areaId
          }))
        };
      }

      // 4. Executa a atualização
      const member: any = await tx.member.update({
        where: { id },
        data: payload,
        include: {
          ministry: true,
          team: true,
          congregation: { select: { id: true, name: true, is_main: true } },
          areas: { include: { area: true } }
        }
      });

      return {
        id: member.id,
        name: member.name,
        email: member.email,
        phone: member.phone,
        role: member.role,
        teamName: member.team?.name,
        ministry: member.ministry?.name,
        congregation_id: member.congregation_id,
        congregation: member.congregation,
        createdAt: member.created_at,
        is_active: member.is_active,
        areas: member.areas ? member.areas.map((ma: any) => ({ id: ma.area.id, name: ma.area.name })) : []
      };
    });
  }

  async deleteMember(id: string) {
    return await prisma.$transaction(async (tx) => {
      await tx.shiftAssignment.deleteMany({
        where: { member_id: id }
      });

      await tx.memberArea.deleteMany({
        where: { member_id: id }
      });

      await tx.member.delete({
        where: { id }
      });

      return { success: true };
    });
  }
}