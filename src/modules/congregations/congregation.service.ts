import { prisma } from '../../shared/database/prisma.js';
import { CreateCongregationType, UpdateCongregationType } from './congregation.schemas.js';

export class CongregationService {
  /**
   * Garante que a congregação Sede exista no banco e vincula dados legados a ela.
   */
  async ensureSedeExists() {
    try {
      let sede = await prisma.congregation.findFirst({
        where: { is_main: true }
      });

      if (!sede) {
        // Verifica se existe alguma congregação com nome "Sede"
        sede = await prisma.congregation.findFirst({
          where: { name: { equals: 'Sede', mode: 'insensitive' } }
        });

        if (!sede) {
          sede = await prisma.congregation.create({
            data: {
              name: 'Sede',
              city: 'Itamaraju',
              cult_days: ['DOMINGO', 'QUINTA'],
              is_main: true,
              is_active: true
            }
          });
        } else {
          sede = await prisma.congregation.update({
            where: { id: sede.id },
            data: { is_main: true }
          });
        }
      }

      // Migração suave dos dados legados que estiverem sem congregation_id
      await prisma.ministry.updateMany({
        where: { congregation_id: null },
        data: { congregation_id: sede.id }
      });

      await prisma.member.updateMany({
        where: { congregation_id: null },
        data: { congregation_id: sede.id }
      });

      await prisma.schedule.updateMany({
        where: { congregation_id: null },
        data: { congregation_id: sede.id }
      });

      // Garante que os ministérios essenciais da Sede existam
      const defaultSedeMinistries = [
        { name: 'Louvor', color: '#3b82f6' },
        { name: 'Multimídia', color: '#8b5cf6' },
        { name: 'Recepção', color: '#10b981' }
      ];

      for (const dm of defaultSedeMinistries) {
        const exists = await prisma.ministry.findFirst({
          where: {
            name: { equals: dm.name, mode: 'insensitive' },
            congregation_id: sede.id
          }
        });
        if (!exists) {
          await prisma.ministry.create({
            data: {
              name: dm.name,
              color: dm.color,
              congregation_id: sede.id
            } as any
          });
        }
      }

      return sede;
    } catch (error) {
      console.error('Erro na rotina ensureSedeExists:', error);
      return null;
    }
  }

  async list(onlyActive: boolean = false) {
    const where: any = {};
    if (onlyActive) {
      where.is_active = true;
    }

    const congregations = await prisma.congregation.findMany({
      where,
      include: {
        _count: {
          select: {
            ministries: true,
            members: true,
            schedules: true
          }
        }
      },
      orderBy: [
        { is_main: 'desc' },
        { name: 'asc' }
      ]
    });

    return congregations.map(c => ({
      id: c.id,
      name: c.name,
      city: c.city,
      address: c.address,
      cult_days: c.cult_days,
      is_main: c.is_main,
      is_active: c.is_active,
      createdAt: c.created_at,
      ministriesCount: c._count.ministries,
      membersCount: c._count.members,
      schedulesCount: c._count.schedules
    }));
  }

  async getById(id: string) {
    const congregation = await prisma.congregation.findUnique({
      where: { id },
      include: {
        ministries: {
          orderBy: { name: 'asc' },
          include: {
            _count: {
              select: { members: true, teams: true, areas: true }
            }
          }
        },
        _count: {
          select: {
            members: true,
            schedules: true
          }
        }
      }
    });

    if (!congregation) {
      throw new Error('Congregação não encontrada.');
    }

    return congregation;
  }

  async getMainCongregation() {
    let main = await prisma.congregation.findFirst({
      where: { is_main: true }
    });

    if (!main) {
      main = await this.ensureSedeExists();
    }

    return main;
  }

  async create(data: CreateCongregationType) {
    const cleanName = data.name.trim();

    const existing = await prisma.congregation.findFirst({
      where: {
        name: { equals: cleanName, mode: 'insensitive' }
      }
    });

    if (existing) {
      throw new Error(`Já existe uma congregação com o nome "${cleanName}".`);
    }

    // Se marcar como principal (is_main: true), remove a flag das outras
    if (data.is_main) {
      await prisma.congregation.updateMany({
        where: { is_main: true },
        data: { is_main: false }
      });
    }

    return await prisma.congregation.create({
      data: {
        name: cleanName,
        city: data.city || 'Itamaraju',
        address: data.address || null,
        cult_days: data.cult_days || ['DOMINGO', 'QUINTA'],
        is_main: data.is_main || false,
        is_active: data.is_active ?? true
      }
    });
  }

  async update(id: string, data: UpdateCongregationType) {
    const congregation = await prisma.congregation.findUnique({
      where: { id }
    });

    if (!congregation) {
      throw new Error('Congregação não encontrada.');
    }

    if (data.name) {
      const cleanName = data.name.trim();
      const existing = await prisma.congregation.findFirst({
        where: {
          id: { not: id },
          name: { equals: cleanName, mode: 'insensitive' }
        }
      });

      if (existing) {
        throw new Error(`Já existe uma congregação com o nome "${cleanName}".`);
      }
      data.name = cleanName;
    }

    // Se marcar esta como principal, desmarca as outras
    if (data.is_main) {
      await prisma.congregation.updateMany({
        where: { id: { not: id }, is_main: true },
        data: { is_main: false }
      });
    }

    return await prisma.congregation.update({
      where: { id },
      data
    });
  }

  async delete(id: string) {
    const congregation = await prisma.congregation.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            ministries: true,
            members: true,
            schedules: true
          }
        }
      }
    });

    if (!congregation) {
      throw new Error('Congregação não encontrada.');
    }

    if (congregation.is_main) {
      throw new Error('A congregação Sede principal não pode ser excluída.');
    }

    if (congregation._count.members > 0 || congregation._count.ministries > 0) {
      throw new Error(
        `Não é possível excluir esta congregação pois ela possui ${congregation._count.members} membro(s) e ${congregation._count.ministries} ministério(s) associados. Desative-a ou transfira os registros primeiro.`
      );
    }

    return await prisma.congregation.delete({
      where: { id }
    });
  }
}
