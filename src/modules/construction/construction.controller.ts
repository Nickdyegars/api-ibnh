// src/modules/construction/construction.controller.ts
import { FastifyReply, FastifyRequest } from 'fastify';
import { ConstructionService } from './construction.service.js';
import { constructionInfoSchema, constructionPhotoSchema } from './construction.schemas.js';
// 👇 Importando o nosso serviço de Auditoria
import { AuditService } from '../../shared/services/audit/audit.service.js';

const constructionService = new ConstructionService();

export class ConstructionController {

  // Pega tudo de uma vez para a Landing Page (Info + Fotos) - Rota Pública
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
      const requester = request.user as any;
      const data = constructionInfoSchema.parse(request.body);
      const updated = await constructionService.updateInfo(data);

      // 📝 LOG: Atualização das metas/dados da construção
      AuditService.log(requester.sub, 'UPDATE', 'CONSTRUCTION_INFO', undefined, data);

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
      const requester = request.user as any;
      const { image_url } = constructionPhotoSchema.parse(request.body);
      const newPhoto = await constructionService.addPhoto(image_url) as any;

      // 📝 LOG: Nova foto adicionada à galeria da obra
      AuditService.log(requester.sub, 'CREATE', 'CONSTRUCTION_PHOTO', newPhoto?.id, { image_url });

      return reply.status(201).send(newPhoto);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  }

  async deletePhoto(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      const { id } = request.params as { id: string };
      await constructionService.deletePhoto(id);

      // 📝 LOG: Remoção de foto da galeria
      AuditService.log(requester.sub, 'DELETE', 'CONSTRUCTION_PHOTO', id);

      return reply.send({ message: 'Foto apagada com sucesso' });
    } catch (error) {
      return reply.status(400).send({ error: 'Erro ao apagar foto' });
    }
  }

  async updateOrder(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      const { id } = request.params as { id: string };
      const { order } = request.body as { order: number };

      if (typeof order !== 'number') {
        return reply.status(400).send({ error: 'A nova ordem deve ser um número válido.' });
      }

      const updated = await constructionService.updatePhotoOrder(id, order);

      // 📝 LOG: Alteração na ordem de exibição das fotos da obra
      AuditService.log(requester.sub, 'UPDATE_ORDER', 'CONSTRUCTION_PHOTO', id, { order });

      return reply.send(updated);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message || 'Erro ao atualizar ordem.' });
    }
  }
}