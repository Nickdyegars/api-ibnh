// src/modules/events/event.controller.ts
import { FastifyReply, FastifyRequest } from 'fastify';
import { EventService } from './event.service.js';
// Trocamos a importação
import { eventBodySchema, updateEventSchema } from './event.schemas.js';

const eventService = new EventService();

export class EventController {

  async getPublic(request: FastifyRequest, reply: FastifyReply) {
    try {
      const events = await eventService.getPublicEvents();
      return reply.send(events);
    } catch (error: any) {
      return reply.status(500).send({ error: 'Erro ao buscar eventos públicos' });
    }
  }

  async getAll(request: FastifyRequest, reply: FastifyReply) {
    try {
      const events = await eventService.getAllEvents();
      return reply.send(events);
    } catch (error: any) {
      return reply.status(500).send({ error: 'Erro ao buscar eventos do CMS' });
    }
  }

  async create(request: FastifyRequest, reply: FastifyReply) {
    try {
      const data = eventBodySchema.parse(request.body);
      const newEvent = await eventService.createEvent(data);
      return reply.status(201).send(newEvent);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  }

  async update(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      // 👇 MUDAMOS AQUI: Usamos diretamente o novo schema parcial
      const data = updateEventSchema.parse(request.body);
      const updatedEvent = await eventService.updateEvent(id, data);
      return reply.send(updatedEvent);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  }

  async delete(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      await eventService.deleteEvent(id);
      return reply.send({ message: 'Evento apagado com sucesso' });
    } catch (error: any) {
      console.error("🔥 Erro ao deletar evento no banco:", error);
      return reply.status(400).send({ error: 'Erro ao apagar evento' });
    }
  }
}