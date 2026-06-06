import { prisma } from '../../shared/database/prisma.js';
import { RegisterEcdType, EditionEcdType } from './ecd.schemas.js';
import { uploadImage } from '../../shared/storage/minio.js';

export class EcdService {

  async createRegistration(data: RegisterEcdType, files: any) {
    const tokenRecord = await prisma.ecdToken.findUnique({ where: { token_code: data.token } });
    if (!tokenRecord) throw new Error("TOKEN_NOT_FOUND");
    if (tokenRecord.is_used) throw new Error("TOKEN_ALREADY_USED");

    let profileUrl = null, receiptUrl = null;
    if (files.profilePhoto) profileUrl = await uploadImage(files.profilePhoto.filename, files.profilePhoto.buffer, files.profilePhoto.mimetype, 'ecd/profiles');
    if (files.receiptPhoto) receiptUrl = await uploadImage(files.receiptPhoto.filename, files.receiptPhoto.buffer, files.receiptPhoto.mimetype, 'ecd/receipts');

    return await prisma.$transaction(async (tx) => {
      const registration = await tx.ecdRegistration.create({
        data: {
          full_name: data.fullName, nickname: data.nickname ?? null, phone: data.phone, gender: data.gender,
          age: data.age, address: data.address, is_married: data.isMarried, spouse_name: data.spouseName ?? null,
          relative_going: data.relativeGoing, relative_degree: data.relativeDegree ?? null, has_illness: data.hasIllness,
          illness_desc: data.illnessDesc ?? null, takes_medication: data.takesMedication, medication_desc: data.medicationDesc ?? null,
          dietary_restriction: data.dietaryRestriction, dietary_desc: data.dietaryDesc ?? null, shirt_size: data.shirtSize ?? null,
          emergency_contact: data.emergencyContact, emergency_phone: data.emergencyPhone, in_cell: data.inCell,
          cell_leader_name: data.cellLeaderName ?? null, invited_by: data.invitedBy ?? null, profile_photo_url: profileUrl,
          receipt_photo_url: receiptUrl, ficha_type: tokenRecord.token_type, leader_id: tokenRecord.leader_id,
          token_id: tokenRecord.id, status: 'ATIVO'
        }
      });

      await tx.ecdToken.update({ where: { id: tokenRecord.id }, data: { is_used: true, usedAt: new Date() } });

      const field = tokenRecord.token_type === 'AMARELA' ? 'used_yellow_slots' : 'used_green_slots';
      await tx.ecdLeader.update({ where: { id: tokenRecord.leader_id }, data: { [field]: { increment: 1 } } });

      return registration;
    });
  }

  async getLeaders() {
    return await prisma.ecdLeader.findMany({ orderBy: { createdAt: 'desc' }, include: { tokens: true } });
  }

  async createLeaderWithTokens(name: string, yellowSlots: number, greenSlots: number) {
    const leader = await prisma.ecdLeader.create({ data: { name, total_yellow_slots: yellowSlots, total_green_slots: greenSlots } });
    const tokens = [
      ...Array.from({ length: yellowSlots }).map(() => ({ leader_id: leader.id, token_type: 'AMARELA' })),
      ...Array.from({ length: greenSlots }).map(() => ({ leader_id: leader.id, token_type: 'VERDE' }))
    ];
    await prisma.ecdToken.createMany({ data: tokens });
    return leader;
  }

  async updateLeader(id: string, name: string, yellowSlots: number, greenSlots: number) {
    const leader = await prisma.ecdLeader.findUnique({ where: { id }, include: { tokens: true } });
    if (!leader) throw new Error("Líder não encontrado.");
    if (yellowSlots < leader.used_yellow_slots || greenSlots < leader.used_green_slots) throw new Error("Não é possível reduzir cota abaixo do utilizado.");

    return await prisma.$transaction(async (tx) => {
      const updated = await tx.ecdLeader.update({ where: { id }, data: { name, total_yellow_slots: yellowSlots, total_green_slots: greenSlots } });
      const yellowDiff = yellowSlots - leader.total_yellow_slots;
      const greenDiff = greenSlots - leader.total_green_slots;

      if (yellowDiff > 0) await tx.ecdToken.createMany({ data: Array.from({ length: yellowDiff }).map(() => ({ leader_id: id, token_type: 'AMARELA' })) });
      else if (yellowDiff < 0) {
        const unused = leader.tokens.filter(t => t.token_type === 'AMARELA' && !t.is_used).slice(0, Math.abs(yellowDiff)).map(t => t.id);
        await tx.ecdToken.deleteMany({ where: { id: { in: unused } } });
      }

      if (greenDiff > 0) await tx.ecdToken.createMany({ data: Array.from({ length: greenDiff }).map(() => ({ leader_id: id, token_type: 'VERDE' })) });
      else if (greenDiff < 0) {
        const unused = leader.tokens.filter(t => t.token_type === 'VERDE' && !t.is_used).slice(0, Math.abs(greenDiff)).map(t => t.id);
        await tx.ecdToken.deleteMany({ where: { id: { in: unused } } });
      }
      return updated;
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
      if (reg.token_id) await tx.ecdToken.update({ where: { id: reg.token_id }, data: { is_used: false } });
      if (reg.leader_id) {
        const field = reg.ficha_type === 'AMARELA' ? 'used_yellow_slots' : 'used_green_slots';
        await tx.ecdLeader.update({ where: { id: reg.leader_id }, data: { [field]: { decrement: 1 } } });
      }
      return { success: true };
    });
  }

  async validateToken(tokenCode: string) {
    const token = await prisma.ecdToken.findUnique({ where: { token_code: tokenCode }, include: { leader: true } });
    if (!token) throw new Error("TOKEN_NOT_FOUND");
    if (token.is_used) throw new Error("TOKEN_ALREADY_USED");
    return { isValid: true, tokenType: token.token_type, leaderName: token.leader.name };
  }

  // ================= EDIÇÕES ================= //
  async getEditions() { return await prisma.ecdEdition.findMany({ orderBy: { created_at: 'desc' } }); }
  async createEdition(data: EditionEcdType) { return await prisma.ecdEdition.create({ data: { name: data.name, yellow_slots: data.yellowSlots, green_slots: data.greenSlots, worker_slots: data.workerSlots } }); }
  async updateEdition(id: string, data: EditionEcdType) { return await prisma.ecdEdition.update({ where: { id }, data: { name: data.name, yellow_slots: data.yellowSlots, green_slots: data.greenSlots, worker_slots: data.workerSlots } }); }
  async deleteEdition(id: string) { return await prisma.ecdEdition.delete({ where: { id } }); }
}