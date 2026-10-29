import { prisma } from "../../shared/database/prisma.js";
import { CreateAlbumType, UpdateAlbumType } from "./gallery.schemas.js";
import {
  deleteImage,
  deleteFolder,
  sanitizeAlbumFolderName,
} from "../../shared/storage/minio.js";

export class GalleryService {
  // ==========================================
  // ÁLBUNS
  // ==========================================

  async getAllAlbums(publicOnly: boolean = false) {
    const albums = await prisma.galleryAlbum.findMany({
      where: publicOnly ? { is_active: true } : {},
      orderBy: { event_date: "desc" },
      include: {
        _count: { select: { photos: true } },
      },
    });

    const albumViews = await prisma.siteAnalytics.groupBy({
      by: ["page"],
      where: {
        action: "VISIT",
        page: { startsWith: "Álbum: " },
      },
      _count: {
        id: true,
      },
    });

    const viewsMap = new Map<string, number>();
    for (const v of albumViews) {
      if (v.page) {
        const albumId = v.page.replace("Álbum: ", "").trim();
        viewsMap.set(albumId, (viewsMap.get(albumId) || 0) + v._count.id);
      }
    }

    return albums.map((album) => ({
      ...album,
      views_count: viewsMap.get(album.id) || 0,
    }));
  }

  async getAlbumById(id: string) {
    const album = await prisma.galleryAlbum.findUnique({
      where: { id },
      include: {
        photos: { orderBy: { created_at: "asc" } },
      },
    });
    if (!album) throw new Error("Álbum não encontrado.");

    const viewsCount = await prisma.siteAnalytics.count({
      where: {
        action: "VISIT",
        page: `Álbum: ${id}`,
      },
    });

    return {
      ...album,
      views_count: viewsCount,
    };
  }

  async createAlbum(data: CreateAlbumType) {
    // Calcula a expiração: Hoje + 7 dias exatos
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 7);

    return await prisma.galleryAlbum.create({
      data: {
        title: data.title,
        event_date: new Date(data.event_date),
        cover_url: data.cover_url || null,
        expires_at: expirationDate,
        is_active: true,
        is_expired: false,
      },
    });
  }

  async updateAlbum(id: string, data: UpdateAlbumType) {
    const payload: any = {};
    if (data.title) payload.title = data.title;
    if (data.event_date) payload.event_date = new Date(data.event_date);
    if (data.cover_url !== undefined)
      payload.cover_url = data.cover_url || null;
    if (data.is_active !== undefined) payload.is_active = data.is_active;
    if (data.expires_at) payload.expires_at = new Date(data.expires_at);

    return await prisma.galleryAlbum.update({
      where: { id },
      data: payload,
    });
  }

  async deleteAlbum(id: string) {
    const album = await prisma.galleryAlbum.findUnique({
      where: { id },
      include: { photos: true },
    });

    if (!album) {
      throw new Error("Álbum não encontrado.");
    }

    // 1. Apaga a pasta inteira do álbum do MinIO (com todas as fotos e capa)
    const albumFolder = sanitizeAlbumFolderName(album.title);
    await deleteFolder(`galeria/${albumFolder}/`);

    // 2. Apaga individualmente como fallback caso arquivos estejam em caminhos legados
    if (album.cover_url) {
      await deleteImage(album.cover_url);
    }

    if (album.photos && album.photos.length > 0) {
      for (const photo of album.photos) {
        if (photo.image_url) {
          await deleteImage(photo.image_url);
        }
      }
    }

    // 3. Apaga as fotos e o álbum no banco de dados em transação
    return await prisma.$transaction(async (tx) => {
      await tx.galleryPhoto.deleteMany({
        where: { album_id: id },
      });

      return await tx.galleryAlbum.delete({
        where: { id },
      });
    });
  }

  // ==========================================
  // FOTOS
  // ==========================================

  async addPhotosToAlbum(albumId: string, photoUrls: string[]) {
    // Insere várias fotos de uma vez no banco de dados
    const photosData = photoUrls.map((url) => ({
      album_id: albumId,
      image_url: url,
    }));

    await prisma.galleryPhoto.createMany({
      data: photosData,
    });

    return { success: true, count: photoUrls.length };
  }

  async deletePhoto(photoId: string) {
    const photo = await prisma.galleryPhoto.findUnique({
      where: { id: photoId },
    });

    if (photo && photo.image_url) {
      await deleteImage(photo.image_url);
    }

    return await prisma.galleryPhoto.delete({
      where: { id: photoId },
    });
  }

  // ==========================================
  // ROTINA DE FAXINA AUTOMÁTICA (CRON JOB)
  // ==========================================

  async cleanupExpiredAlbums() {
    const now = new Date();
    const expiredAlbums = await prisma.galleryAlbum.findMany({
      where: { expires_at: { lte: now }, is_expired: false },
    });

    if (expiredAlbums.length === 0)
      return { message: "Nenhum álbum para expirar." };

    for (const album of expiredAlbums) {
      console.log(`🧹 Limpando álbum expirado: "${album.title}" (${album.id})...`);

      // 1. Apaga a pasta inteira do álbum do MinIO (fotos + capa)
      const albumFolder = sanitizeAlbumFolderName(album.title);
      await deleteFolder(`galeria/${albumFolder}/`);

      // 2. Apaga capa se estiver em caminho legado
      if (album.cover_url) {
        await deleteImage(album.cover_url);
      }

      // 3. Apaga fotos individuais caso alguma esteja fora da pasta do álbum
      const photos = await prisma.galleryPhoto.findMany({
        where: { album_id: album.id },
      });
      for (const photo of photos) {
        if (photo.image_url) {
          await deleteImage(photo.image_url);
        }
      }

      // 4. Apaga as fotos do banco de dados e marca o álbum como expirado e inativo
      await prisma.galleryPhoto.deleteMany({ where: { album_id: album.id } });
      await prisma.galleryAlbum.update({
        where: { id: album.id },
        data: { is_expired: true, cover_url: null, is_active: false },
      });
      console.log(`✅ Álbum "${album.title}" expirado com sucesso e arquivos removidos do MinIO.`);
    }

    return {
      message: `${expiredAlbums.length} álbum(ns) expirado(s) e limpo(s).`,
    };
  }
}
