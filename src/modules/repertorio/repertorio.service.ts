import { prisma } from '../../shared/database/prisma.js';
import { SongType, UpdateSongType } from './repertorio.schemas.js';

export class RepertorioService {
  async getSongs() {
    return await prisma.repertoireSong.findMany({
      include: {
        versions: true,
      },
      orderBy: { title: 'asc' },
    });
  }

  async createSong(data: SongType) {
    let targetSongId = data.song_id;

    // 1. Se não houver song_id, cria o registro pai da música
    if (!targetSongId && data.new_song_title) {
      const newSong = await prisma.repertoireSong.create({
        // 👇 CORREÇÃO 1: Garantimos ao TS que isso é uma string
        data: { title: data.new_song_title as string },
      });
      targetSongId = newSong.id;
    }

    if (!targetSongId) {
      throw new Error('Falha ao identificar ou criar a música pai.');
    }

    // 2. Cria a versão vinculada à música pai
    return await prisma.repertoireSongVersion.create({
      data: {
        song_id: targetSongId,
        version_name: data.version_name,
        category: data.category,
        tone_fem: data.tone_fem || null,
        tone_masc: data.tone_masc || null,
        link_vs: data.link_vs || null,
        link_youtube: data.link_youtube || null,
        link_spotify: data.link_spotify || null,
        link_cifra: data.link_cifra || null,
      },
    });
  }

  async updateSong(versionId: string, data: UpdateSongType) {
    // Se o título principal da música foi alterado na edição, atualiza a música pai
    if (data.new_song_title) {
      const currentVersion = await prisma.repertoireSongVersion.findUnique({
        where: { id: versionId },
        select: { song_id: true },
      });
      
      if (currentVersion?.song_id) {
        await prisma.repertoireSong.update({
          where: { id: currentVersion.song_id },
          // 👇 CORREÇÃO 2: Garantimos ao TS que isso é uma string
          data: { title: data.new_song_title as string },
        });
      }
    }

    // 👇 CORREÇÃO 3: Montamos um payload de atualização seguro, ignorando undefineds
    const updatePayload: any = {};
    
    if (data.version_name !== undefined) updatePayload.version_name = data.version_name;
    if (data.category !== undefined) updatePayload.category = data.category;
    
    // Tratamento estrito para os campos opcionais (converte string vazia para null)
    if (data.tone_fem !== undefined) updatePayload.tone_fem = data.tone_fem || null;
    if (data.tone_masc !== undefined) updatePayload.tone_masc = data.tone_masc || null;
    if (data.link_vs !== undefined) updatePayload.link_vs = data.link_vs || null;
    if (data.link_youtube !== undefined) updatePayload.link_youtube = data.link_youtube || null;
    if (data.link_spotify !== undefined) updatePayload.link_spotify = data.link_spotify || null;
    if (data.link_cifra !== undefined) updatePayload.link_cifra = data.link_cifra || null;

    // Atualiza os dados específicos da versão
    return await prisma.repertoireSongVersion.update({
      where: { id: versionId },
      data: updatePayload,
    });
  }

  async deleteSong(versionId: string) {
    // Busca a versão para verificar a qual música pertence antes de deletar
    const version = await prisma.repertoireSongVersion.findUnique({
      where: { id: versionId },
      select: { song_id: true },
    });

    // Deleta a versão específica
    await prisma.repertoireSongVersion.delete({
      where: { id: versionId },
    });

    // Limpeza: Se não restou nenhuma outra versão dessa música, remove o título pai para não virar órfão
    if (version?.song_id) {
      const remainingVersions = await prisma.repertoireSongVersion.count({
        where: { song_id: version.song_id },
      });

      if (remainingVersions === 0) {
        await prisma.repertoireSong.delete({
          where: { id: version.song_id },
        });
      }
    }

    return { success: true };
  }
}

export const repertorioService = new RepertorioService();