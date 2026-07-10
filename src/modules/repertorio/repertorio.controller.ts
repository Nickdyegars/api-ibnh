import { FastifyReply, FastifyRequest } from 'fastify';
import { repertorioService } from './repertorio.service.js';
import { songSchema, updateSongSchema } from './repertorio.schemas.js';
import { AuditService } from '../../shared/services/audit/audit.service.js';

export class RepertorioController {
  
  async getSongs(request: FastifyRequest, reply: FastifyReply) {
    try {
      const songs = await repertorioService.getSongs();
      return reply.send(songs);
    } catch (error) {
      return reply.status(500).send({ error: 'Erro ao buscar o repertório.' });
    }
  }

  async createSong(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      const validatedData = songSchema.parse(request.body);
      const version = await repertorioService.createSong(validatedData) as any;

      AuditService.log(requester.sub, 'CREATE', 'SONG_VERSION', version?.id, validatedData);

      return reply.status(201).send(version);
    } catch (error: any) {
      if (error.errors) return reply.status(400).send({ error: error.errors[0].message });
      return reply.status(400).send({ error: error.message || 'Erro ao cadastrar música/versão.' });
    }
  }

  async updateSong(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      const { id } = request.params as { id: string }; // Aqui o ID representa o ID da Versão
      
      const validatedData = updateSongSchema.parse(request.body);
      const updatedVersion = await repertorioService.updateSong(id, validatedData);

      AuditService.log(requester.sub, 'UPDATE', 'SONG_VERSION', id, validatedData);

      return reply.send(updatedVersion);
    } catch (error: any) {
      if (error.errors) return reply.status(400).send({ error: error.errors[0].message });
      return reply.status(400).send({ error: 'Erro ao atualizar versão da música.' });
    }
  }

  async deleteSong(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      const { id } = request.params as { id: string }; // ID da versão
      
      await repertorioService.deleteSong(id);

      AuditService.log(requester.sub, 'DELETE', 'SONG_VERSION', id);

      return reply.send({ message: 'Versão removida do repertório.' });
    } catch (error) {
      return reply.status(400).send({ error: 'Erro ao remover versão.' });
    }
  }
}

export const repertorioController = new RepertorioController();