import { prisma } from '../../shared/database/prisma.js'; // Ajuste o caminho se o seu prisma.ts ficar em outro lugar

export class RepertorioService {
  async getSongs() {
    return await prisma.repertoireSong.findMany({
      orderBy: { title: 'asc' } // Já devolve em ordem alfabética
    });
  }

  async createSong(data: any) {
    return await prisma.repertoireSong.create({
      data: {
        // Adicione os 4 campos nas funções createSong e updateSong:
        title: data.title,
        category: data.category,
        tone_fem: data.tone_fem,
        tone_masc: data.tone_masc,
        link_vs: data.link_vs,             // 👈 Novo
        link_youtube: data.link_youtube,   // 👈 Novo
        link_spotify: data.link_spotify,   // 👈 Novo
        link_cifra: data.link_cifra,       // 👈 Novo
      }
    });
  }

  async updateSong(id: string, data: any) {
    return await prisma.repertoireSong.update({
      where: { id },
      data: {
        // Adicione os 4 campos nas funções createSong e updateSong:
        title: data.title,
        category: data.category,
        tone_fem: data.tone_fem,
        tone_masc: data.tone_masc,
        link_vs: data.link_vs,             // 👈 Novo
        link_youtube: data.link_youtube,   // 👈 Novo
        link_spotify: data.link_spotify,   // 👈 Novo
        link_cifra: data.link_cifra,       // 👈 Novo
      }
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