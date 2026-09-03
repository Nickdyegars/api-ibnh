import { prisma } from '../../shared/database/prisma.js';

export class MinistryAreaService {
  async getAreas(ministryName: string) {
    if (!ministryName || ministryName === 'all') return [];
    
    const ministry = await prisma.ministry.findUnique({ 
        where: { name: ministryName } 
    });
    
    if (!ministry) return [];
    
    return await prisma.ministryArea.findMany({ 
        where: { ministry_id: ministry.id },
        orderBy: { name: 'asc' }
    });
  }

  async createArea(name: string, ministryName: string) {
    const ministry = await prisma.ministry.upsert({
      where: { name: ministryName },
      update: {},
      create: { name: ministryName }
    });

    return await prisma.ministryArea.create({
      data: { 
        name, 
        ministry_id: ministry.id 
      }
    });
  }

  async deleteArea(id: string) {
    await prisma.ministryArea.delete({ 
        where: { id } 
    });
    return { success: true };
  }
}