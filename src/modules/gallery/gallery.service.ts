import { prisma } from "../../shared/database/prisma.js";
import { CreateAlbumType, UpdateAlbumType } from "./gallery.schemas.js";
import { deleteImage } from "../../shared/storage/minio.js"; // Ajuste o caminho

export class GalleryService {
  // ==========================================
  // ÁLBUNS
  // ==========================================

  async getAllAlbums(publicOnly: boolean = false) {
    return await prisma.galleryAlbum.findMany({
      where: publicOnly ? { is_active: true } : {},
      orderBy: { event_date: "desc" },
      include: {
        _count: { select: { photos: true } }, // Traz a quantidade de fotos do álbum
      },
    });
  }

  async getAlbumById(id: string) {
    const album = await prisma.galleryAlbum.findUnique({
      where: { id },
      include: {
        photos: { orderBy: { created_at: "asc" } },
      },
    });
    if (!album) throw new Error("Álbum não encontrado.");
    return album;
  }

  async createAlbum(data: CreateAlbumType) {
    // 👇 Calcula a expiração: Hoje + 7 dias exatos
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
    if (data.expires_at) payload.expires_at = new Date(data.expires_at); // 👇 LINHA ADICIONADA

    return await prisma.galleryAlbum.update({
      where: { id },
      data: payload,
    });
  }

  async deleteAlbum(id: string) {
    return await prisma.galleryAlbum.delete({
      where: { id },
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
      // 1. Busca todas as fotos deste álbum
      const photos = await prisma.galleryPhoto.findMany({
        where: { album_id: album.id },
      });

      // 2. Apaga FISICAMENTE do MinIO (liberando os 150GB!)
      for (const photo of photos) {
        await deleteImage(photo.image_url);
      }

      // 3. Apaga do banco de dados e marca o álbum como expirado
      await prisma.galleryPhoto.deleteMany({ where: { album_id: album.id } });
      await prisma.galleryAlbum.update({
        where: { id: album.id },
        data: { is_expired: true, cover_url: null }, // Remove a capa também
      });
    }

    return {
      message: `${expiredAlbums.length} álbum(ns) expirado(s) e limpo(s).`,
    };
  }
}
