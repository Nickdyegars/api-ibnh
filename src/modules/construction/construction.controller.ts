// src/modules/construction/construction.controller.ts
import { FastifyReply, FastifyRequest } from 'fastify';
import { ConstructionService } from './construction.service.js';
import { constructionInfoSchema, constructionPhotoSchema } from './construction.schemas.js';

const constructionService = new ConstructionService();

export class ConstructionController {
  
  // Pega tudo de uma vez para a Landing Page (Info + Fotos)
  async getPublicData(request: FastifyRequest, reply: FastifyReply) {
    try {
      const info = await constructionService.getInfo();
      const photos = await constructionService.getPhotos();
      return reply.send({ info, photos });
    } catch (error) {
      return reply.status(500).send({ error: 'Erro ao buscar dados da construção' });
    }
  }

  // === MÉTODOS DO CMS (PAINEL) ===
  async getInfo(request: FastifyRequest, reply: FastifyReply) {
    try {
      const info = await constructionService.getInfo();
      return reply.send(info);
    } catch (error) {
      return reply.status(500).send({ error: 'Erro ao buscar informações.' });
    }
  }

  async updateInfo(request: FastifyRequest, reply: FastifyReply) {
    try {
      const data = constructionInfoSchema.parse(request.body);
      const updated = await constructionService.updateInfo(data);
      return reply.send(updated);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  }

  async getPhotos(request: FastifyRequest, reply: FastifyReply) {
    try {
      const photos = await constructionService.getPhotos();
      return reply.send(photos);
    } catch (error) {
      return reply.status(500).send({ error: 'Erro ao buscar fotos.' });
    }
  }

  async addPhoto(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { image_url } = constructionPhotoSchema.parse(request.body);
      const newPhoto = await constructionService.addPhoto(image_url);
      return reply.status(201).send(newPhoto);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  }

  async deletePhoto(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      await constructionService.deletePhoto(id);
      return reply.send({ message: 'Foto apagada com sucesso' });
    } catch (error) {
      return reply.status(400).send({ error: 'Erro ao apagar foto' });
    }
  }
}