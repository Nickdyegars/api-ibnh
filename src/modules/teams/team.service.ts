import { prisma } from '../../shared/database/prisma.js';

export class TeamService {
  async getTeams(ministryName: string) {
    if (!ministryName || ministryName === 'all') return [];
    
    const ministry = await prisma.ministry.findUnique({ 
        where: { name: ministryName } 
    });
    
    if (!ministry) return [];
    
    return await prisma.team.findMany({ 
        where: { ministry_id: ministry.id },
        orderBy: { name: 'asc' }
    });
  }

  async createTeam(name: string, ministryName: string) {
    // Busca ou cria o ministério caso ele ainda não exista
    const ministry = await prisma.ministry.upsert({
      where: { name: ministryName },
      update: {},
      create: { name: ministryName }
    });

    return await prisma.team.create({
      data: { 
        name, 
        ministry_id: ministry.id 
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