// src/modules/events/event.schemas.ts
import { z } from 'zod';

export const eventBodySchema = z.object({
  title: z.string().min(3, "O título deve ter pelo menos 3 caracteres"),
  description: z.string().min(5, "A descrição é obrigatória"),
  event_date: z.string().datetime("Data inválida. Use o formato ISO."),
  end_date: z.string().datetime().optional().nullable(),
  button_text: z.string().optional().nullable(),
  link_url: z.string().optional().nullable(),
  image_url: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
  order: z.number().int().optional()
});

export type EventBodyType = z.infer<typeof eventBodySchema>;

// 👇 ADICIONAMOS ISTO PARA A ATUALIZAÇÃO 👇
export const updateEventSchema = eventBodySchema.partial();
export type UpdateEventType = z.infer<typeof updateEventSchema>;