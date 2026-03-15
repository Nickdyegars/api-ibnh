// src/modules/events/event.service.ts
import { prisma } from '../../shared/database/prisma.js';
// Trocamos a importação para incluir o UpdateEventType
import { EventBodyType, UpdateEventType } from './event.schemas.js';

export class EventService {

  async getPublicEvents() {
    return await prisma.siteEvent.findMany({
      where: { is_active: true },
      orderBy: { event_date: 'asc' },
      take: 3
    });
  }

  async getAllEvents() {
    return await prisma.siteEvent.findMany({
      orderBy: { event_date: 'asc' }
    });
  }

  async createEvent(data: EventBodyType) {
    const event = await prisma.siteEvent.create({
      data: {
        title: data.title,
        description: data.description,
        event_date: new Date(data.event_date),
        end_date: data.end_date ? new Date(data.end_date) : null,
        button_text: data.button_text ?? "Saber Mais",
        link_url: data.link_url ?? null,
        image_url: data.image_url ?? null,
        is_active: data.is_active ?? true,
        order: data.order ?? 0
      }
    });
    return event;
  }

  // 👇 MUDAMOS AQUI: De Partial<EventBodyType> para UpdateEventType
  async updateEvent(id: string, data: UpdateEventType) {
    
    const updateData: any = {};

    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.event_date !== undefined) updateData.event_date = new Date(data.event_date);
    if (data.end_date !== undefined) updateData.end_date = data.end_date ? new Date(data.end_date) : null;
    if (data.button_text !== undefined) updateData.button_text = data.button_text;
    if (data.link_url !== undefined) updateData.link_url = data.link_url;
    if (data.image_url !== undefined) updateData.image_url = data.image_url;
    if (data.is_active !== undefined) updateData.is_active = data.is_active;
    if (data.order !== undefined) updateData.order = data.order;

    const event = await prisma.siteEvent.update({
      where: { id },
      data: updateData
    });
    
    return event;
  }

  async deleteEvent(id: string) {
    await prisma.siteEvent.delete({
      where: { id }
    });
    return { success: true };
  }
}