import { z } from 'zod';

// 👇 1. Schemas para o CRUD de Tags/Filtros
export const tagSchema = z.object({
  name: z.string().min(1, 'O nome da tag é obrigatório'),
  color: z.string().optional().nullable(),
});

export const updateTagSchema = tagSchema.partial();

// 👇 2. Schemas das Músicas Atualizados
export const songSchema = z.object({
  song_id: z.string().uuid().optional().nullable().or(z.literal('')),
  new_song_title: z.string().optional().nullable().or(z.literal('')),
  version_name: z.string().min(1, 'O nome da versão é obrigatório'),

  // Substituímos 'category' por um array opcional de IDs de tags
  tags: z.array(z.string().uuid()).optional(),

  tone_fem: z.string().optional().nullable().or(z.literal('')),
  tone_masc: z.string().optional().nullable().or(z.literal('')),

  link_vs: z.string().url('Link do VS inválido').optional().nullable().or(z.literal('')),
  link_youtube: z.string().url('Link do YouTube inválido').optional().nullable().or(z.literal('')),
  link_spotify: z.string().url('Link do Spotify inválido').optional().nullable().or(z.literal('')),
  link_cifra: z.string().url('Link da Cifra inválido').optional().nullable().or(z.literal('')),
}).refine((data) => data.song_id || data.new_song_title, {
  message: 'É necessário selecionar uma música existente ou digitar o título de uma nova música.',
  path: ['new_song_title'],
});

export type SongType = z.infer<typeof songSchema>;

export const updateSongSchema = z.object({
  version_name: z.string().min(1, 'O nome da versão é obrigatório').optional(),

  // Array de IDs de tags para atualizar as categorias da música
  tags: z.array(z.string().uuid()).optional(),

  tone_fem: z.string().optional().nullable().or(z.literal('')),
  tone_masc: z.string().optional().nullable().or(z.literal('')),
  link_vs: z.string().url('Link do VS inválido').optional().nullable().or(z.literal('')),
  link_youtube: z.string().url('Link do YouTube inválido').optional().nullable().or(z.literal('')),
  link_spotify: z.string().url('Link do Spotify inválido').optional().nullable().or(z.literal('')),
  link_cifra: z.string().url('Link da Cifra inválido').optional().nullable().or(z.literal('')),
  new_song_title: z.string().optional().nullable().or(z.literal('')),
});

export type UpdateSongType = z.infer<typeof updateSongSchema>;