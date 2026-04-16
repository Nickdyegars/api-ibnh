// src/modules/community-business-category/community-business-category.service.ts
import { prisma } from '../../shared/database/prisma.js';
import { CategoryCreateType, CategoryUpdateType } from './community-business-category.schemas.js';

export class CommunityBusinessCategoryService {
  
  // Para o site e formulário: Retorna apenas categorias ativas, em ordem alfabética
  async getPublicCategories() {
    return await prisma.communityBusinessCategory.findMany({
      where: { is_active: true },
      orderBy: { name: 'asc' }
    });
  }

  // Para o painel: Retorna todas
  async getAllForCms() {
    return await prisma.communityBusinessCategory.findMany({
      orderBy: { name: 'asc' }
    });
  }

  async create(data: CategoryCreateType) {
    return await prisma.communityBusinessCategory.create({
      data: {
        name: data.name,
        is_active: data.is_active ?? true // Categorias já nascem ativas por padrão
      }
    });
  }

  async update(id: string, data: CategoryUpdateType) {
    // Filtra o objeto para remover chaves cujo valor seja 'undefined'
    const updateData = Object.fromEntries(
      Object.entries(data).filter(([_, value]) => value !== undefined)
    );

    return await prisma.communityBusinessCategory.update({
      where: { id },
      data: updateData
    });
  }

  async delete(id: string) {
    await prisma.communityBusinessCategory.delete({
      where: { id }
    });
    return { success: true };
  }
}