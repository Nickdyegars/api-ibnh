import { prisma } from '../../shared/database/prisma.js';

export class MinistryService {
  async list() {
    const ministries = await prisma.ministry.findMany({
      include: {
        _count: {
          select: {
            members: true,
            teams: true,
            areas: true,
            schedules: true
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    return ministries.map(m => ({
      id: m.id,
      name: m.name,
      color: (m as any).color || '#3b82f6',
      membersCount: m._count.members,
      teamsCount: m._count.teams,
      areasCount: m._count.areas,
      schedulesCount: m._count.schedules
    }));
  }

  async create(name: string, color?: string) {
    const cleanName = name.trim();
    if (!cleanName) {
      throw new Error('O nome da equipe não pode ser vazio.');
    }

    const existing = await prisma.ministry.findFirst({
      where: {
        name: {
          equals: cleanName,
          mode: 'insensitive'
        }
      }
    });

    if (existing) {
      throw new Error(`A equipe "${cleanName}" já existe no sistema.`);
    }

    return await prisma.ministry.create({
      data: {
        name: cleanName,
        color: color || '#3b82f6'
      } as any
    });
  }

  async update(id: number, name: string, color?: string) {
    const cleanName = name.trim();
    if (!cleanName) {
      throw new Error('O nome da equipe não pode ser vazio.');
    }

    const current = await prisma.ministry.findUnique({ where: { id } });
    if (!current) {
      throw new Error('Equipe não encontrada.');
    }

    // Verifica se já existe outra equipe com esse nome
    const conflict = await prisma.ministry.findFirst({
      where: {
        id: { not: id },
        name: {
          equals: cleanName,
          mode: 'insensitive'
        }
      }
    });

    if (conflict) {
      throw new Error(`Já existe outra equipe com o nome "${cleanName}".`);
    }

    const updateData: any = { name: cleanName };
    if (color) updateData.color = color;

    const updated = await prisma.ministry.update({
      where: { id },
      data: updateData
    });

    // Se o nome mudou, sincroniza os usuários atribuídos a essa equipe
    if (current.name !== cleanName) {
      await prisma.user.updateMany({
        where: { ministry_access: current.name },
        data: { ministry_access: cleanName }
      });
    }

    return updated;
  }

  async delete(id: number) {
    const ministry = await prisma.ministry.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            members: true,
            schedules: true,
            teams: true,
            areas: true
          }
        }
      }
    });

    if (!ministry) {
      throw new Error('Equipe não encontrada.');
    }

    if (ministry._count.members > 0 || ministry._count.schedules > 0) {
      throw new Error(
        `Não é possível excluir a equipe "${ministry.name}" pois ela possui ${ministry._count.members} membro(s) e/ou ${ministry._count.schedules} escala(s) vinculadas. Remova ou transfira esses vínculos antes de excluir.`
      );
    }

    // Remove áreas e times associados antes de deletar a equipe
    await prisma.ministryArea.deleteMany({ where: { ministry_id: id } });
    await prisma.team.deleteMany({ where: { ministry_id: id } });

    // Atualiza usuários que tinham acesso específico para "all"
    await prisma.user.updateMany({
      where: { ministry_access: ministry.name },
      data: { ministry_access: 'all' }
    });

    await prisma.ministry.delete({ where: { id } });

    return { success: true, deletedName: ministry.name };
  }
}
