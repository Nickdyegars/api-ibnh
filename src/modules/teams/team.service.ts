import { prisma } from '../../shared/database/prisma.js';

export class TeamService {
  async getTeams(ministryName: string, congregationId?: string | null) {
    if (!ministryName || ministryName === 'all') return [];

    let targetCongregationId = congregationId;
    if (!targetCongregationId) {
      const sede = await prisma.congregation.findFirst({ where: { is_main: true } });
      if (sede) targetCongregationId = sede.id;
    }

    const where: any = {
      name: { equals: ministryName, mode: 'insensitive' }
    };
    if (targetCongregationId) {
      where.congregation_id = targetCongregationId;
    }

    const ministry = await prisma.ministry.findFirst({ where });
    if (!ministry) return [];

    return await prisma.team.findMany({
      where: { ministry_id: ministry.id },
      orderBy: { name: 'asc' }
    });
  }

  async createTeam(name: string, ministryName: string, congregationId?: string | null) {
    let targetCongregationId = congregationId;
    if (!targetCongregationId) {
      const sede = await prisma.congregation.findFirst({ where: { is_main: true } });
      if (sede) targetCongregationId = sede.id;
    }

    const where: any = {
      name: { equals: ministryName, mode: 'insensitive' }
    };
    if (targetCongregationId) {
      where.congregation_id = targetCongregationId;
    }

    let ministry = await prisma.ministry.findFirst({ where });

    if (!ministry) {
      ministry = await prisma.ministry.create({
        data: {
          name: ministryName,
          congregation_id: targetCongregationId || null
        } as any
      });
    }

    return await prisma.team.create({
      data: {
        name,
        ministry_id: ministry.id
      }
    });
  }

  async findById(id: string) {
    return await prisma.team.findUnique({
      where: { id },
      include: {
        ministry: {
          include: { congregation: true }
        }
      }
    });
  }

  async deleteTeam(id: string) {
    await prisma.team.delete({
      where: { id }
    });
    return { success: true };
  }
}
