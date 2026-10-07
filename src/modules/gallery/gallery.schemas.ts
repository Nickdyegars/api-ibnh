import { z } from 'zod';

export const createAlbumSchema = z.object({
  title: z.string().min(2, "O título do álbum é obrigatório"),
  event_date: z.string().min(10, "A data do evento é obrigatória"), // Ex: "2026-10-15"
  cover_url: z.string().url("URL da capa inválida").optional().nullable().or(z.literal('')),
});

export type CreateAlbumType = z.infer<typeof createAlbumSchema>;

export const updateAlbumSchema = z.object({
  title: z.string().min(2).optional(),
  event_date: z.string().optional(),
  cover_url: z.string().url().optional().nullable().or(z.literal('')),
  is_active: z.boolean().optional(),
  expires_at: z.string().optional()
});

export type UpdateAlbumType = z.infer<typeof updateAlbumSchema>;

export const addPhotosSchema = z.object({
  // Recebe um array com as URLs das imagens já upadas no MinIO
  photos: z.array(z.string().url("URL de imagem inválida")).min(1, "Envie pelo menos uma foto")
});