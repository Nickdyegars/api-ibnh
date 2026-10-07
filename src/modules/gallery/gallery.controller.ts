import { FastifyReply, FastifyRequest } from 'fastify';
import { GalleryService } from './gallery.service.js';
import { createAlbumSchema, updateAlbumSchema, addPhotosSchema } from './gallery.schemas.js';
import { AuditService } from '../../shared/services/audit/audit.service.js';

const galleryService = new GalleryService();

export class GalleryController {

  // --- ROTAS PÚBLICAS (Landing Page) ---
  
  async listPublic(request: FastifyRequest, reply: FastifyReply) {
    try {
      const albums = await galleryService.getAllAlbums(true);
      return reply.send(albums);
    } catch (error: any) {
      return reply.status(500).send({ error: 'Erro ao buscar galeria.' });
    }
  }

  async getAlbum(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const album = await galleryService.getAlbumById(id);
      return reply.send(album);
    } catch (error: any) {
      return reply.status(404).send({ error: error.message });
    }
  }

  // --- ROTAS PROTEGIDAS (Painel Admin) ---

  async listAdmin(request: FastifyRequest, reply: FastifyReply) {
    try {
      const albums = await galleryService.getAllAlbums(false);
      return reply.send(albums);
    } catch (error: any) {
      return reply.status(500).send({ error: 'Erro ao buscar álbuns.' });
    }
  }

  async create(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      const data = createAlbumSchema.parse(request.body);

      const newAlbum = await galleryService.createAlbum(data);
      AuditService.log(requester.sub, 'CREATE', 'GALLERY_ALBUM', newAlbum.id, data);

      return reply.status(201).send(newAlbum);
    } catch (error: any) {
      if (error.errors) return reply.status(400).send({ error: error.errors[0].message });
      return reply.status(400).send({ error: error.message });
    }
  }

  async update(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      const { id } = request.params as { id: string };
      const data = updateAlbumSchema.parse(request.body);

      const updatedAlbum = await galleryService.updateAlbum(id, data);
      AuditService.log(requester.sub, 'UPDATE', 'GALLERY_ALBUM', id, data);

      return reply.send(updatedAlbum);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  }

  async delete(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      const { id } = request.params as { id: string };

      await galleryService.deleteAlbum(id);
      AuditService.log(requester.sub, 'DELETE', 'GALLERY_ALBUM', id);

      return reply.send({ message: 'Álbum apagado com sucesso.' });
    } catch (error: any) {
      return reply.status(400).send({ error: 'Erro ao apagar álbum.' });
    }
  }

  async addPhotos(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      const { id } = request.params as { id: string };
      const data = addPhotosSchema.parse(request.body);

      const result = await galleryService.addPhotosToAlbum(id, data.photos);
      AuditService.log(requester.sub, 'CREATE', 'GALLERY_PHOTOS', id, { count: data.photos.length });

      return reply.status(201).send(result);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  }

  async deletePhoto(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      const { photoId } = request.params as { photoId: string };

      await galleryService.deletePhoto(photoId);
      AuditService.log(requester.sub, 'DELETE', 'GALLERY_PHOTO', photoId);

      return reply.send({ message: 'Foto apagada.' });
    } catch (error: any) {
      return reply.status(400).send({ error: 'Erro ao apagar foto.' });
    }
  }
}