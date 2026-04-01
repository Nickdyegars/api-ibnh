// src/modules/construction/construction.schemas.ts
import { z } from 'zod';

export const constructionInfoSchema = z.object({
  pix_key: z.string().optional().nullable(),
  qr_code_url: z.string().optional().nullable(),
  instagram_url: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
  description: z.string().optional(),
  verse_text: z.string().optional(),
});

export type ConstructionInfoType = z.infer<typeof constructionInfoSchema>;

export const constructionPhotoSchema = z.object({
  image_url: z.string().url("URL da imagem inválida"),
});