import { prisma } from '../../shared/database/prisma.js';

export class TeamService {
  async getTeams(ministryName: string) {
    if (!ministryName || ministryName === 'all') return [];
    
    const ministry = await prisma.ministry.findFirst({ 
        where: { name: { equals: ministryName, mode: 'insensitive' } } 
    });
    
    if (!ministry) return [];
    
    return await prisma.team.findMany({ 
        where: { ministry_id: ministry.id },
        orderBy: { name: 'asc' }
    });
  }

  async createTeam(name: string, ministryName: string) {
    let ministry = await prisma.ministry.findFirst({
      where: { name: { equals: ministryName, mode: 'insensitive' } }
    });

    if (!ministry) {
      ministry = await prisma.ministry.create({
        data: { name: ministryName }
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
      include: { ministry: true }
    });
  }

  async deleteTeam(id: string) {
    await prisma.team.delete({ 
        where: { id } 
    });
    return { success: true };
  }
}