import { FastifyRequest, FastifyReply } from 'fastify';
import { repertorioService } from './repertorio.service.js';
import { songSchema } from './repertorio.schemas.js'; // 👈 Importando o schema

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
      // 👇 Valida os dados antes de prosseguir
      const validatedData = songSchema.parse(request.body);
      
      const song = await repertorioService.createSong(validatedData);
      return reply.status(201).send(song);
    } catch (error: any) {
      // Se for erro do Zod, devolve a mensagem bonitinha
      if (error.errors) {
        return reply.status(400).send({ error: error.errors[0].message });
      }
      return reply.status(400).send({ error: 'Erro ao cadastrar música.' });
    }
  }

  async updateSong(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      
      // 👇 Valida os dados antes de atualizar
      const validatedData = songSchema.parse(request.body);

      const song = await repertorioService.updateSong(id, validatedData);
      return reply.send(song);
    } catch (error: any) {
      if (error.errors) {
        return reply.status(400).send({ error: error.errors[0].message });
      }
      return reply.status(400).send({ error: 'Erro ao atualizar música.' });
    }
  }

  async deleteSong(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      await repertorioService.deleteSong(id);
      return reply.send({ message: 'Música removida do repertório.' });
    } catch (error) {
      return reply.status(400).send({ error: 'Erro ao remover música.' });
    }
  }
}

export const repertorioController = new RepertorioController();