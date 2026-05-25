import { prisma } from '../../shared/database/prisma.js';
import { SongType, UpdateSongType } from './repertorio.schemas.js'; // 👈 IMPORTAÇÃO DOS TIPOS

export class RepertorioService {
  async getSongs() {
    return await prisma.repertoireSong.findMany({
      orderBy: { title: 'asc' }
    });
  }

  // 👇 TIPADO COM SongType 👇
  async createSong(data: SongType) {
    return await prisma.repertoireSong.create({
      data: {
        title: data.title,
        category: data.category,
        link_vs: data.link_vs, // Obrigatório, não precisa de null

        // Converte undefined para null para agradar o Prisma
        tone_fem: data.tone_fem ?? null,
        tone_masc: data.tone_masc ?? null,
        link_youtube: data.link_youtube ?? null,
        link_spotify: data.link_spotify ?? null,
        link_cifra: data.link_cifra ?? null,
      }
    });
  }

  // 👇 TIPADO COM UpdateSongType e Filtrado 👇
  async updateSong(id: string, data: UpdateSongType) {
    // Filtra undefined automaticamente para atualizar apenas o que foi enviado
    const updateData = Object.fromEntries(
      Object.entries(data).filter(([_, value]) => value !== undefined)
    );

    return await prisma.repertoireSong.update({
      where: { id },
      data: updateData
    });
  }

  async deleteSong(id: string) {
    await prisma.repertoireSong.delete({
      where: { id }
    });
    return { success: true };
  }
}

export const repertorioService = new RepertorioService();