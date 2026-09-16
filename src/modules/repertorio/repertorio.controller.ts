import { FastifyReply, FastifyRequest } from 'fastify';
import { repertorioService } from './repertorio.service.js';
import { songSchema, updateSongSchema, tagSchema, updateTagSchema } from './repertorio.schemas.js';
import { AuditService } from '../../shared/services/audit/audit.service.js';

export class RepertorioController {
  
  // --- MÚSICAS E VERSÕES ---
  
  async getSongs(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { tagId } = request.query as { tagId?: string };
      const songs = await repertorioService.getSongs(tagId);
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
      const { id } = request.params as { id: string }; 
      
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
      const { id } = request.params as { id: string }; 
      
      await repertorioService.deleteSong(id);
      AuditService.log(requester.sub, 'DELETE', 'SONG_VERSION', id);
      return reply.send({ message: 'Versão removida do repertório.' });
    } catch (error) {
      return reply.status(400).send({ error: 'Erro ao remover versão.' });
    }
  }

  // --- TAGS E FILTROS ---

  async getTags(request: FastifyRequest, reply: FastifyReply) {
    try {
      const tags = await repertorioService.getTags();
      return reply.send(tags);
    } catch (error) {
      return reply.status(500).send({ error: 'Erro ao buscar tags.' });
    }
  }

  async createTag(request: FastifyRequest, reply: FastifyReply) {
    try {
      const validatedData = tagSchema.parse(request.body);
      const tag = await repertorioService.createTag(validatedData);
      return reply.status(201).send(tag);
    } catch (error: any) {
      if (error.code === 'P2002') return reply.status(400).send({ error: 'Já existe uma tag com este nome.' });
      if (error.errors) return reply.status(400).send({ error: error.errors[0].message });
      return reply.status(400).send({ error: 'Erro ao cadastrar tag.' });
    }
  }

  async updateTag(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const validatedData = updateTagSchema.parse(request.body);
      const tag = await repertorioService.updateTag(id, validatedData);
      return reply.send(tag);
    } catch (error: any) {
      if (error.code === 'P2002') return reply.status(400).send({ error: 'Já existe uma tag com este nome.' });
      return reply.status(400).send({ error: 'Erro ao atualizar tag.' });
    }
  }

  async deleteTag(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      await repertorioService.deleteTag(id);
      return reply.send({ message: 'Tag removida.' });
    } catch (error) {
      return reply.status(400).send({ error: 'Erro ao remover tag.' });
    }
  }
}

export const repertorioController = new RepertorioController();