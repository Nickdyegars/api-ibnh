// src/modules/events/event.controller.ts
import { FastifyReply, FastifyRequest } from 'fastify';
import { EventService } from './event.service.js';
import { eventBodySchema, updateEventSchema } from './event.schemas.js';
// 👇 Importando o nosso serviço de Auditoria
import { AuditService } from '../../shared/services/audit/audit.service.js';

const eventService = new EventService();

export class EventController {

  // Rota Pública
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
      const requester = request.user as any;
      const data = eventBodySchema.parse(request.body);
      const newEvent = await eventService.createEvent(data) as any;

      // 📝 LOG: Novo evento adicionado ao calendário da igreja
      AuditService.log(requester.sub, 'CREATE', 'EVENT', newEvent?.id, data);

      return reply.status(201).send(newEvent);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  }

  async update(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      const { id } = request.params as { id: string };
      const data = updateEventSchema.parse(request.body);
      const updatedEvent = await eventService.updateEvent(id, data);

      // 📝 LOG: Alteração nos dados do evento
      AuditService.log(requester.sub, 'UPDATE', 'EVENT', id, data);

      return reply.send(updatedEvent);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  }

  async delete(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      const { id } = request.params as { id: string };
      await eventService.deleteEvent(id);

      // 📝 LOG: Exclusão permanente do evento
      AuditService.log(requester.sub, 'DELETE', 'EVENT', id);

      return reply.send({ message: 'Evento apagado com sucesso' });
    } catch (error: any) {
      console.error("🔥 Erro ao deletar evento no banco:", error);
      return reply.status(400).send({ error: 'Erro ao apagar evento' });
    }
  }
}