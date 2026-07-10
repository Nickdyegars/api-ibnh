import { z } from 'zod';

export const songSchema = z.object({
  song_id: z.string().uuid().optional().nullable().or(z.literal('')),
  new_song_title: z.string().optional().nullable().or(z.literal('')),
  version_name: z.string().min(1, 'O nome da versão é obrigatório'),
  category: z.string().min(1, 'A categoria é obrigatória'),
  tone_fem: z.string().optional().nullable().or(z.literal('')),
  tone_masc: z.string().optional().nullable().or(z.literal('')),
  
  // Todos os links agora tratam string vazia, nula ou ausente como opcional
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
  category: z.string().min(1, 'A categoria é obrigatória').optional(),
  tone_fem: z.string().optional().nullable().or(z.literal('')),
  tone_masc: z.string().optional().nullable().or(z.literal('')),
  link_vs: z.string().url('Link do VS inválido').optional().nullable().or(z.literal('')),
  link_youtube: z.string().url('Link do YouTube inválido').optional().nullable().or(z.literal('')),
  link_spotify: z.string().url('Link do Spotify inválido').optional().nullable().or(z.literal('')),
  link_cifra: z.string().url('Link da Cifra inválido').optional().nullable().or(z.literal('')),
  new_song_title: z.string().optional().nullable().or(z.literal('')),
});

export type UpdateSongType = z.infer<typeof updateSongSchema>;