import { z } from 'zod';

// ==========================================
// SOBRE NÓS
// ==========================================
export const updateAboutSchema = z.object({
  title: z.string().optional(),
  content: z.string().min(1, 'O conteúdo do Sobre Nós é obrigatório'),
  image_url: z.string().nullable().optional(),
  hero_image_url: z.string().nullable().optional(),
  stat_members: z.string().optional(),
  stat_years: z.string().optional(),
  stat_cells: z.string().optional(),
});

export type UpdateAboutType = z.infer<typeof updateAboutSchema>;

// ==========================================
// CONTATOS
// ==========================================
export const updateContactsSchema = z.object({
  address: z.string().nullable().optional(),
  phone_1_name: z.string().nullable().optional(),
  phone_1_number: z.string().nullable().optional(),
  phone_2_name: z.string().nullable().optional(),
  phone_2_number: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  facebook_link: z.string().nullable().optional(),
  instagram_link: z.string().nullable().optional(),
  youtube_link: z.string().nullable().optional(),
});

export type UpdateContactsType = z.infer<typeof updateContactsSchema>;

// ==========================================
// PROGRAMAÇÃO (CULTOS)
// ==========================================
export const programSchema = z.object({
  title: z.string().min(1, 'O título da programação é obrigatório'),
  day: z.string().min(1, 'O dia é obrigatório'),
  time: z.string().min(1, 'O horário é obrigatório'),
  description: z.string().min(1, 'A descrição é obrigatória'),
  image_url: z.string().nullable().optional(),
  is_active: z.boolean().optional().default(true),
  order: z.number().int().optional().default(0),
});

export const updateProgramSchema = programSchema.partial();

export type ProgramType = z.infer<typeof programSchema>;
export type UpdateProgramType = z.infer<typeof updateProgramSchema>;

// ==========================================
// PASTORES
// ==========================================
export const pastorSchema = z.object({
  name: z.string().min(1, 'O nome do pastor é obrigatório'),
  role: z.string().min(1, 'O cargo/função é obrigatório'),
  bio: z.string().min(1, 'A biografia é obrigatória'),
  image_url: z.string().nullable().optional(),
  social_link: z.string().nullable().optional(),
  is_active: z.boolean().optional().default(true),
  order: z.number().int().optional().default(0),
});

export const updatePastorSchema = pastorSchema.partial();

export type PastorType = z.infer<typeof pastorSchema>;
export type UpdatePastorType = z.infer<typeof updatePastorSchema>;

// ==========================================
// CÉLULAS
// ==========================================
export const cellSchema = z.object({
  name: z.string().min(1, 'O nome da célula é obrigatório'),
  leader: z.string().min(1, 'O líder da célula é obrigatório'),
  day: z.string().min(1, 'O dia da célula é obrigatório'),
  time: z.string().min(1, 'O horário da célula é obrigatório'),
  location: z.string().min(1, 'O local da célula é obrigatório'),
  audience: z.string().nullable().optional(),
  contact_link: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
  is_active: z.boolean().optional().default(true),
  order: z.number().int().optional().default(0),
});

export const updateCellSchema = cellSchema.partial();

export type CellType = z.infer<typeof cellSchema>;
export type UpdateCellType = z.infer<typeof updateCellSchema>;

// ==========================================
// MINISTÉRIOS
// ==========================================
export const siteMinistrySchema = z.object({
  name: z.string().min(1, 'O nome do ministério é obrigatório'),
  description: z.string().min(1, 'A descrição do ministério é obrigatória'),
  image_url: z.string().nullable().optional(),
  tags: z.array(z.string()).optional().default([]),
  is_active: z.boolean().optional().default(true),
  order: z.number().int().optional().default(0),
});

export const updateSiteMinistrySchema = siteMinistrySchema.partial();

export type SiteMinistryType = z.infer<typeof siteMinistrySchema>;
export type UpdateSiteMinistryType = z.infer<typeof updateSiteMinistrySchema>;

// ==========================================
// PROJETOS SOCIAIS
// ==========================================
export const projectSchema = z.object({
  title: z.string().min(1, 'O título do projeto é obrigatório'),
  description: z.string().min(1, 'A descrição do projeto é obrigatória'),
  image_url: z.string().nullable().optional(),
  responsible: z.string().nullable().optional(),
  tags: z.array(z.string()).optional().default([]),
  is_active: z.boolean().optional().default(true),
  order: z.number().int().optional().default(0),
});

export const updateProjectSchema = projectSchema.partial();

export type ProjectType = z.infer<typeof projectSchema>;
export type UpdateProjectType = z.infer<typeof updateProjectSchema>;
