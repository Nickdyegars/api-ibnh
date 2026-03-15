// src/modules/construction/construction.service.ts
import { prisma } from '../../shared/database/prisma.js';
import { ConstructionInfoType } from './construction.schemas.js';

export class ConstructionService {
  
  // === INFORMAÇÕES GERAIS (PIX, LINKS) ===
  async getInfo() {
    let info = await prisma.siteConstructionInfo.findFirst();
    // Se não existir nenhuma informação ainda, cria uma linha vazia por padrão
    if (!info) {
      info = await prisma.siteConstructionInfo.create({ data: {} });
    }
    return info;
  }

  async updateInfo(data: ConstructionInfoType) {
    const info = await this.getInfo();
    
    // Tratamento rigoroso do TypeScript para evitar enviar "undefined"
    const updateData: any = {};
    if (data.pix_key !== undefined) updateData.pix_key = data.pix_key;
    if (data.qr_code_url !== undefined) updateData.qr_code_url = data.qr_code_url;
    if (data.instagram_url !== undefined) updateData.instagram_url = data.instagram_url;

    return await prisma.siteConstructionInfo.update({
      where: { id: info.id },
      data: updateData
    });
  }

  // === FOTOS DO CARROSSEL ===
  async getPhotos() {
    return await prisma.siteConstructionPhoto.findMany({
      orderBy: { created_at: 'asc' } // Mostra as mais antigas primeiro
    });
  }

  async addPhoto(image_url: string) {
    return await prisma.siteConstructionPhoto.create({
      data: { image_url }
    });
  }

  async deletePhoto(id: string) {
    await prisma.siteConstructionPhoto.delete({
      where: { id }
    });
    return { success: true };
  }
}