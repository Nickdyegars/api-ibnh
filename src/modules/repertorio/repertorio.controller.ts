import { FastifyReply, FastifyRequest } from 'fastify';
import { repertorioService } from './repertorio.service.js';
import { songSchema, updateSongSchema } from './repertorio.schemas.js';
// 👇 Importando o nosso serviço de Auditoria
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
      const song = await repertorioService.createSong(validatedData) as any;

      // 📝 LOG: Nova música adicionada ao repertório da igreja
      AuditService.log(requester.sub, 'CREATE', 'SONG', song?.id, validatedData);

      return reply.status(201).send(song);
    } catch (error: any) {
      if (error.errors) return reply.status(400).send({ error: error.errors[0].message });
      return reply.status(400).send({ error: 'Erro ao cadastrar música.' });
    }
  }

  async updateSong(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      const { id } = request.params as { id: string };
      
      const validatedData = updateSongSchema.parse(request.body);
      const song = await repertorioService.updateSong(id, validatedData);

      // 📝 LOG: Alteração na letra, cifra ou metadados da música
      AuditService.log(requester.sub, 'UPDATE', 'SONG', id, validatedData);

      return reply.send(song);
    } catch (error: any) {
      if (error.errors) return reply.status(400).send({ error: error.errors[0].message });
      return reply.status(400).send({ error: 'Erro ao atualizar música.' });
    }
  }

  async deleteSong(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      const { id } = request.params as { id: string };
      
      await repertorioService.deleteSong(id);

      // 📝 LOG: Remoção definitiva da música do repertório
      AuditService.log(requester.sub, 'DELETE', 'SONG', id);

      return reply.send({ message: 'Música removida do repertório.' });
    } catch (error) {
      return reply.status(400).send({ error: 'Erro ao remover música.' });
    }
  }
}

export const repertorioController = new RepertorioController();