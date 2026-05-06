import { z } from 'zod';

export const songSchema = z.object({
  title: z.string().min(1, 'O título da música é obrigatório'),
  category: z.string().min(1, 'A categoria é obrigatória'),
  tone_fem: z.string().optional().nullable(),
  tone_masc: z.string().optional().nullable(),
  
  // VS é obrigatório (o min garante que não venha vazio)
  link_vs: z.string().url('O link do VS precisa ser uma URL válida').min(1, 'O link do VS é obrigatório'),
  
  // Os outros são opcionais (podem vir vazios)
  link_youtube: z.string().url('Link do YouTube inválido').optional().nullable().or(z.literal('')),
  link_spotify: z.string().url('Link do Spotify inválido').optional().nullable().or(z.literal('')),
  link_cifra: z.string().url('Link da Cifra inválido').optional().nullable().or(z.literal('')),
});

export type SongType = z.infer<typeof songSchema>;