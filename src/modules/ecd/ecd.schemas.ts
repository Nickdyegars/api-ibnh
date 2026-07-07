import { z } from 'zod';

const simNaoToBool = z.enum(['sim', 'nao']).transform((val) => val === 'sim').or(z.boolean());

export const registerEcdSchema = z.object({
  token: z.string().uuid("Token de inscrição inválido."),
  fullName: z.string().min(3, "Nome completo é obrigatório"),
  nickname: z.string().optional().nullable(),
  phone: z.string().min(10, "Telefone inválido"),
  gender: z.enum(['M', 'F']),
  age: z.union([z.number(), z.string().transform(Number)]),
  address: z.string().min(5, "Endereço é obrigatório"),
  isMarried: simNaoToBool,
  spouseName: z.string().optional().nullable(),
  relativeGoing: simNaoToBool,
  relativeDegree: z.string().optional().nullable(),
  hasIllness: simNaoToBool,
  illnessDesc: z.string().optional().nullable(),
  takesMedication: simNaoToBool,
  medicationDesc: z.string().optional().nullable(),
  dietaryRestriction: simNaoToBool,
  dietaryDesc: z.string().optional().nullable(),
  shirtSize: z.string().optional().nullable(),
  emergencyContact: z.string().min(3, "Contato de emergência obrigatório"),
  emergencyPhone: z.string().min(10, "Telefone de emergência inválido"),
  inCell: simNaoToBool,
  cellLeaderName: z.string().optional().nullable(),
  invitedBy: z.string().optional().nullable(),
  lgpdConsent: z.union([z.boolean(), z.string()]).transform(val => val === true || val === 'true'),
  lgpdConsentDate: z.string().optional(),
  lgpdTermsVersion: z.string().optional(),
  spiritualStatus: z.string().optional(),
  inviteCode: z.string().min(1, "O Código do Líder é obrigatório"),
});

export const editionEcdSchema = z.object({
  name: z.string().min(3, "O nome da edição é obrigatório"),
  yellowSlots: z.number().int().min(0, "A cota não pode ser negativa").or(z.string().transform(Number)),
  greenSlots: z.number().int().min(0, "A cota não pode ser negativa").or(z.string().transform(Number)),
  workerSlots: z.number().int().min(0, "A cota não pode ser negativa").or(z.string().transform(Number)),
  encontristaPaymentLink: z.string().optional().nullable(),
  workerPaymentLink: z.string().optional().nullable()
});

export type RegisterEcdType = z.infer<typeof registerEcdSchema>;
export type EditionEcdType = z.infer<typeof editionEcdSchema>;