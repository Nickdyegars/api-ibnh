import { prisma } from '../../shared/database/prisma.js';
import { SongType, UpdateSongType } from './repertorio.schemas.js';

export class RepertorioService {
  
  // ==========================================
  // GERENCIAMENTO DE MÚSICAS E VERSÕES
  // ==========================================
  
  async getSongs(tagId?: string) {
    // 👇 CORREÇÃO: Usamos um objeto vazio {} no where ao invés de undefined
    const whereClause = tagId ? { tags: { some: { id: tagId } } } : {};
    
    return await prisma.repertoireSong.findMany({
      where: whereClause,
      include: {
        versions: true,
        tags: true,
      },
      orderBy: { title: 'asc' },
    });
  }

  async createSong(data: SongType) {
    let targetSongId = data.song_id;

    // 1. Se não houver song_id, cria o registro pai da música com as tags
    if (!targetSongId && data.new_song_title) {
      // 👇 CORREÇÃO: Construindo payload dinâmico para não enviar undefined
      const songData: any = { title: data.new_song_title as string };
      
      if (data.tags && data.tags.length > 0) {
        songData.tags = { connect: data.tags.map((id: string) => ({ id })) };
      }
      
      const newSong = await prisma.repertoireSong.create({
        data: songData,
      });
      targetSongId = newSong.id;
    } else if (targetSongId && data.tags && data.tags.length > 0) {
      await prisma.repertoireSong.update({
        where: { id: targetSongId },
        data: {
          tags: { connect: data.tags.map((id: string) => ({ id })) }
        }
      });
    }

    if (!targetSongId) {
      throw new Error('Falha ao identificar ou criar a música pai.');
    }

    // 2. Cria a versão. Construindo payload dinâmico para os opcionais:
    const versionData: any = {
      song_id: targetSongId,
      version_name: data.version_name,
    };
    
    if (data.tone_fem !== undefined) versionData.tone_fem = data.tone_fem || null;
    if (data.tone_masc !== undefined) versionData.tone_masc = data.tone_masc || null;
    if (data.link_vs !== undefined) versionData.link_vs = data.link_vs || null;
    if (data.link_youtube !== undefined) versionData.link_youtube = data.link_youtube || null;
    if (data.link_spotify !== undefined) versionData.link_spotify = data.link_spotify || null;
    if (data.link_cifra !== undefined) versionData.link_cifra = data.link_cifra || null;

    return await prisma.repertoireSongVersion.create({
      data: versionData,
    });
  }

  async updateSong(versionId: string, data: UpdateSongType) {
    const currentVersion = await prisma.repertoireSongVersion.findUnique({
      where: { id: versionId },
      select: { song_id: true },
    });
      
    if (currentVersion?.song_id) {
      const songUpdatePayload: any = {};
      
      if (data.new_song_title) songUpdatePayload.title = data.new_song_title as string;
      if (data.tags !== undefined) {
        songUpdatePayload.tags = { set: data.tags.map((id: string) => ({ id })) };
      }

      if (Object.keys(songUpdatePayload).length > 0) {
        await prisma.repertoireSong.update({
          where: { id: currentVersion.song_id },
          data: songUpdatePayload,
        });
      }
    }

    const updatePayload: any = {};
    if (data.version_name !== undefined) updatePayload.version_name = data.version_name;
    if (data.tone_fem !== undefined) updatePayload.tone_fem = data.tone_fem || null;
    if (data.tone_masc !== undefined) updatePayload.tone_masc = data.tone_masc || null;
    if (data.link_vs !== undefined) updatePayload.link_vs = data.link_vs || null;
    if (data.link_youtube !== undefined) updatePayload.link_youtube = data.link_youtube || null;
    if (data.link_spotify !== undefined) updatePayload.link_spotify = data.link_spotify || null;
    if (data.link_cifra !== undefined) updatePayload.link_cifra = data.link_cifra || null;

    return await prisma.repertoireSongVersion.update({
      where: { id: versionId },
      data: updatePayload,
    });
  }

  async deleteSong(versionId: string) {
    const version = await prisma.repertoireSongVersion.findUnique({
      where: { id: versionId },
      select: { song_id: true },
    });

    await prisma.repertoireSongVersion.delete({ where: { id: versionId } });

    if (version?.song_id) {
      const remainingVersions = await prisma.repertoireSongVersion.count({
        where: { song_id: version.song_id },
      });

      if (remainingVersions === 0) {
        await prisma.repertoireSong.delete({ where: { id: version.song_id } });
      }
    }

    return { success: true };
  }

  // ==========================================
  // GERENCIAMENTO DE TAGS / FILTROS
  // ==========================================
  
  async getTags() {
    return await prisma.repertoireTag.findMany({
      orderBy: { name: 'asc' }
    });
  }

  // 👇 CORREÇÃO: Aceitando explícitamente "undefined" nos tipos da função para agradar o Zod
  async createTag(data: { name: string; color?: string | null | undefined }) {
    const payload: any = { name: data.name.trim() };
    if (data.color !== undefined) payload.color = data.color || null;
    
    return await prisma.repertoireTag.create({
      data: payload
    });
  }

  // 👇 CORREÇÃO: Aceitando explícitamente "undefined" nos tipos
  async updateTag(tagId: string, data: { name?: string | undefined; color?: string | null | undefined }) {
    const payload: any = {};
    if (data.name !== undefined) payload.name = data.name.trim();
    if (data.color !== undefined) payload.color = data.color;

    return await prisma.repertoireTag.update({
      where: { id: tagId },
      data: payload
    });
  }

  async deleteTag(tagId: string) {
    return await prisma.repertoireTag.delete({
      where: { id: tagId }
    });
  }
}

export const repertorioService = new RepertorioService();