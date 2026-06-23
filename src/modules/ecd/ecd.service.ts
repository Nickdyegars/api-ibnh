import { prisma } from '../../shared/database/prisma.js';
import { RegisterEcdType, EditionEcdType } from './ecd.schemas.js';
import { uploadImage } from '../../shared/storage/minio.js';

export class EcdService {

  async createRegistration(data: RegisterEcdType, files: any) {
    // Valida se o token da edição é real antes de prosseguir
    const editionRecord = await prisma.ecdEdition.findFirst({ where: { public_token: data.token } });
    if (!editionRecord) throw new Error("TOKEN_NOT_FOUND");

    let profileUrl = null, receiptUrl = null;
    if (files.profilePhoto) profileUrl = await uploadImage(files.profilePhoto.filename, files.profilePhoto.buffer, files.profilePhoto.mimetype, 'ecd/profiles');
    if (files.receiptPhoto) receiptUrl = await uploadImage(files.receiptPhoto.filename, files.receiptPhoto.buffer, files.receiptPhoto.mimetype, 'ecd/receipts');

    // Cria a ficha na fila de espera geral
    return await prisma.ecdRegistration.create({
      data: {
        full_name: data.fullName, nickname: data.nickname ?? null, phone: data.phone, gender: data.gender,
        age: data.age, address: data.address, is_married: data.isMarried, spouse_name: data.spouseName ?? null,
        relative_going: data.relativeGoing, relative_degree: data.relativeDegree ?? null, has_illness: data.hasIllness,
        illness_desc: data.illnessDesc ?? null, takes_medication: data.takesMedication, medication_desc: data.medicationDesc ?? null,
        dietary_restriction: data.dietaryRestriction, dietary_desc: data.dietaryDesc ?? null, shirt_size: data.shirtSize ?? null,
        emergency_contact: data.emergencyContact, emergency_phone: data.emergencyPhone, in_cell: data.inCell,
        cell_leader_name: data.cellLeaderName ?? null, invited_by: data.invitedBy ?? null, profile_photo_url: profileUrl,
        receipt_photo_url: receiptUrl,
        spiritual_status: data.spiritualStatus ?? null,

        // Inicializa zerado e aguardando aprovação humana no painel
        status: 'PENDENTE',
        ficha_type: null,
        leader_id: null,
        token_id: null,

        // LGPD
        lgpd_consent: data.lgpdConsent,
        lgpd_consent_date: data.lgpdConsentDate ? new Date(data.lgpdConsentDate) : new Date(),
        lgpd_terms_version: data.lgpdTermsVersion || '1.0'
      }
    });
  }

  async getLeaders() {
    return await prisma.ecdLeader.findMany({ orderBy: { createdAt: 'desc' }, include: { tokens: true } });
  }

  async createLeaderWithTokens(name: string, yellowSlots: number, greenSlots: number) {
    // Apenas criamos o líder com as suas respectivas cotas numéricas
    return await prisma.ecdLeader.create({
      data: {
        name,
        total_yellow_slots: yellowSlots,
        total_green_slots: greenSlots
      }
    });
  }

  async updateLeader(id: string, name: string, yellowSlots: number, greenSlots: number) {
    const leader = await prisma.ecdLeader.findUnique({ where: { id } });
    if (!leader) throw new Error("Líder não encontrado.");

    // Validação de segurança: Não permite diminuir a cota abaixo do que já foi aprovado no painel
    if (yellowSlots < leader.used_yellow_slots || greenSlots < leader.used_green_slots) {
      throw new Error("Não é possível reduzir a cota abaixo do que já foi utilizado.");
    }

    // Atualiza diretamente os valores numéricos
    return await prisma.ecdLeader.update({
      where: { id },
      data: {
        name,
        total_yellow_slots: yellowSlots,
        total_green_slots: greenSlots
      }
    });
  }

  async deleteLeader(id: string) { return await prisma.ecdLeader.delete({ where: { id } }); }

  async getRegistrations() {
    return await prisma.ecdRegistration.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        leader: { select: { name: true } },
        edition: { select: { name: true } }
      }
    });
  }

  async updatePaymentStatus(id: string, status: string) { return await prisma.ecdRegistration.update({ where: { id }, data: { payment_status: status } }); }
  async markAsCompleted(id: string, editionId: string) { return await prisma.ecdRegistration.update({ where: { id }, data: { status: 'CONCLUIDO', edition_id: editionId } }); }

  async deleteRegistration(id: string) {
    const reg = await prisma.ecdRegistration.findUnique({ where: { id } });
    if (!reg) throw new Error("Ficha não encontrada.");

    return await prisma.$transaction(async (tx) => {
      await tx.ecdRegistration.delete({ where: { id } });

      // Se a ficha deletada já tinha sido aprovada e vinculada a um líder, devolvemos o crédito numérico para a cota dele
      if (reg.status === 'ATIVO' && reg.leader_id && reg.ficha_type) {
        const field = reg.ficha_type === 'AMARELA' ? 'used_yellow_slots' : 'used_green_slots';
        await tx.ecdLeader.update({
          where: { id: reg.leader_id },
          data: { [field]: { decrement: 1 } }
        });
      }
      return { success: true };
    });
  }

  async validateToken(tokenCode: string) {
    // O link agora é único da edição (igual ao do trabalhador)
    const edition = await prisma.ecdEdition.findFirst({ where: { public_token: tokenCode } });
    if (!edition) throw new Error("TOKEN_NOT_FOUND");

    // Retorna nulo para líder e tipo, pois o encontrista preencherá na Fila Geral
    return { isValid: true, tokenType: null, leaderName: null };
  }

  // ================= EDIÇÕES ================= //
  async getEditions() { return await prisma.ecdEdition.findMany({ orderBy: { created_at: 'desc' } }); }
  async createEdition(data: EditionEcdType) { return await prisma.ecdEdition.create({ data: { name: data.name, yellow_slots: data.yellowSlots, green_slots: data.greenSlots, worker_slots: data.workerSlots } }); }
  async updateEdition(id: string, data: EditionEcdType) { return await prisma.ecdEdition.update({ where: { id }, data: { name: data.name, yellow_slots: data.yellowSlots, green_slots: data.greenSlots, worker_slots: data.workerSlots } }); }
  async deleteEdition(id: string) { return await prisma.ecdEdition.delete({ where: { id } }); }

  async approveRegistration(registrationId: string, leaderId: string, fichaType: 'AMARELA' | 'VERDE') {
    const leader = await prisma.ecdLeader.findUnique({ where: { id: leaderId } });
    if (!leader) throw new Error("Líder não encontrado.");

    // Verifica se o líder ainda tem saldo numérico disponível naquela cor
    const availSlots = fichaType === 'AMARELA'
      ? leader.total_yellow_slots - leader.used_yellow_slots
      : leader.total_green_slots - leader.used_green_slots;

    if (availSlots <= 0) {
      throw new Error(`O líder ${leader.name} não possui mais vagas disponíveis para fichas ${fichaType}s.`);
    }

    return await prisma.$transaction(async (tx) => {
      // 1. Vincula a ficha ao líder, muda a cor e ativa o status
      const updated = await tx.ecdRegistration.update({
        where: { id: registrationId },
        data: {
          status: 'ATIVO',
          leader_id: leaderId,
          ficha_type: fichaType
        }
      });

      // 2. Incrementa o contador de uso numérico do líder correspondente
      const field = fichaType === 'AMARELA' ? 'used_yellow_slots' : 'used_green_slots';
      await tx.ecdLeader.update({
        where: { id: leaderId },
        data: { [field]: { increment: 1 } }
      });

      return updated;
    });
  }

  async uploadReceiptAdmin(id: string, file: any) {
    // 1. Verifica se a ficha existe
    const reg = await prisma.ecdRegistration.findUnique({ where: { id } });
    if (!reg) throw new Error("Ficha não encontrada.");

    // 2. Faz o upload para o MinIO usando a sua função nativa
    const receiptUrl = await uploadImage(
      file.filename,
      file.buffer,
      file.mimetype,
      'ecd/receipts'
    );

    // 3. Atualiza a URL do banco de dados
    return await prisma.ecdRegistration.update({
      where: { id },
      data: { receipt_photo_url: receiptUrl }
    });
  }

}