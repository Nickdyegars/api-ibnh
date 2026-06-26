import { prisma } from '../../shared/database/prisma.js';
import { RegisterEcdType, EditionEcdType } from './ecd.schemas.js';
import { uploadImage } from '../../shared/storage/minio.js';

export class EcdService {

  // ==========================================
  // INSCRIÇÃO E VALIDAÇÃO DE TOKENS (LINKS)
  // ==========================================

  async validateToken(tokenCode: string) {
    // 👇 Adicione o include da edition aqui
    const tokenRecord = await prisma.ecdToken.findUnique({
      where: { id: tokenCode },
      include: {
        leader: {
          include: {
            cell: true,
            edition: true // Traz os dados da edição (incluindo o PIX)
          }
        }
      }
    });

    if (!tokenRecord) throw new Error("TOKEN_NOT_FOUND");
    if (tokenRecord.isUsed) throw new Error("TOKEN_ALREADY_USED");

    return {
      isValid: true,
      tokenType: tokenRecord.tokenType,
      // 👇 Verifica se tem célula; se não tiver, usa o nome do líder externo
      leaderName: tokenRecord.leader.cell
        ? `${tokenRecord.leader.cell.leader} (${tokenRecord.leader.cell.name})`
        : (tokenRecord.leader.name ?? 'Sem Líder'),
      leaderId: tokenRecord.leaderId,
      // 👇 Força o null para evitar conflito com undefined
      paymentLink: tokenRecord.leader.edition?.encontristaPaymentLink ?? null
    };
  }

  async createRegistration(data: RegisterEcdType, files: any) {
    // Valida o token descartável
    const tokenRecord = await prisma.ecdToken.findUnique({
      where: { id: data.token },
      include: { leader: { include: { cell: true } } }
    });

    if (!tokenRecord) throw new Error("TOKEN_NOT_FOUND");
    if (tokenRecord.isUsed) throw new Error("TOKEN_ALREADY_USED");

    let profileUrl = null, receiptUrl = null;
    if (files.profilePhoto) profileUrl = await uploadImage(files.profilePhoto.filename, files.profilePhoto.buffer, files.profilePhoto.mimetype, 'ecd/profiles');
    if (files.receiptPhoto) receiptUrl = await uploadImage(files.receiptPhoto.filename, files.receiptPhoto.buffer, files.receiptPhoto.mimetype, 'ecd/receipts');

    return await prisma.$transaction(async (tx) => {
      // 1. Cria a ficha amarrada ao líder dono do link
      const registration = await tx.ecdRegistration.create({
        data: {
          full_name: data.fullName, nickname: data.nickname ?? null, phone: data.phone, gender: data.gender,
          age: data.age, address: data.address, is_married: data.isMarried, spouse_name: data.spouseName ?? null,
          relative_going: data.relativeGoing, relative_degree: data.relativeDegree ?? null, has_illness: data.hasIllness,
          illness_desc: data.illnessDesc ?? null, takes_medication: data.takesMedication, medication_desc: data.medicationDesc ?? null,
          dietary_restriction: data.dietaryRestriction, dietary_desc: data.dietaryDesc ?? null, shirt_size: data.shirtSize ?? null,
          emergency_contact: data.emergencyContact, emergency_phone: data.emergencyPhone, in_cell: data.inCell,

          cell_leader_name: tokenRecord.leader.cell?.name ?? tokenRecord.leader.name ?? 'Origem Desconhecida',
          invited_by: data.invitedBy ?? null, profile_photo_url: profileUrl,
          receipt_photo_url: receiptUrl,
          spiritual_status: data.spiritualStatus ?? null,

          status: 'PENDENTE',
          ficha_type: tokenRecord.tokenType,
          leader_id: tokenRecord.leaderId,
          token_id: tokenRecord.id, // Salva qual token gerou esta ficha

          lgpd_consent: data.lgpdConsent,
          lgpd_consent_date: data.lgpdConsentDate ? new Date(data.lgpdConsentDate) : new Date(),
          lgpd_terms_version: data.lgpdTermsVersion || '1.0'
        }
      });

      // 2. Queima o token para não ser usado de novo
      await tx.ecdToken.update({
        where: { id: tokenRecord.id },
        data: { isUsed: true, usedAt: new Date() }
      });

      return registration;
    });
  }

  // ==========================================
  // LÍDERES E COTAS
  // ==========================================

  async getLeaders() {
    const latestEdition = await prisma.ecdEdition.findFirst({
      orderBy: { created_at: 'desc' }
    });

    if (!latestEdition) return [];

    const leaders = await prisma.ecdLeader.findMany({
      where: { editionId: latestEdition.id },
      include: {
        cell: { select: { name: true, leader: true } },
        tokens: true
      },
      orderBy: { cell: { name: 'asc' } }
    });

    return leaders.map(l => ({
      id: l.id,
      name: l.cell ? `${l.cell.leader} (${l.cell.name})` : l.name,
      isExternal: !l.cell, // Flag para o Frontend saber que pode apagar/editar o nome
      total_yellow_slots: l.totalYellowSlots,
      used_yellow_slots: l.usedYellowSlots,
      total_green_slots: l.totalGreenSlots,
      used_green_slots: l.usedGreenSlots,
      tokens: l.tokens
    }));
  }

  async updateLeader(id: string, name: string, yellowSlots: number, greenSlots: number) {
    const leader = await prisma.ecdLeader.findUnique({
      where: { id },
      include: { tokens: true } // Busca os links que já existem
    });
    if (!leader) throw new Error("Líder não encontrado.");

    if (yellowSlots < leader.usedYellowSlots || greenSlots < leader.usedGreenSlots) {
      throw new Error("Não é possível reduzir a cota abaixo do que já foi utilizado.");
    }

    // Calcula quantos links faltam gerar
    const currentYellow = leader.tokens.filter(t => t.tokenType === 'AMARELA').length;
    const currentGreen = leader.tokens.filter(t => t.tokenType === 'VERDE').length;

    const yellowToCreate = yellowSlots - currentYellow;
    const greenToCreate = greenSlots - currentGreen;

    return await prisma.$transaction(async (tx) => {
      // 1. Atualiza os números da cota
      const updatedLeader = await tx.ecdLeader.update({
        where: { id },
        data: { totalYellowSlots: yellowSlots, totalGreenSlots: greenSlots }
      });

      // 2. Gera os links Amarelos novos (se a cota aumentou)
      if (yellowToCreate > 0) {
        await tx.ecdToken.createMany({
          data: Array.from({ length: yellowToCreate }).map(() => ({ leaderId: id, tokenType: 'AMARELA' }))
        });
      } else if (yellowToCreate < 0) {
        // Remove links não usados se o administrador diminuir a cota
        const unused = leader.tokens.filter(t => t.tokenType === 'AMARELA' && !t.isUsed).slice(0, Math.abs(yellowToCreate));
        if (unused.length > 0) await tx.ecdToken.deleteMany({ where: { id: { in: unused.map(t => t.id) } } });
      }

      // 3. Gera os links Verdes novos (se a cota aumentou)
      if (greenToCreate > 0) {
        await tx.ecdToken.createMany({
          data: Array.from({ length: greenToCreate }).map(() => ({ leaderId: id, tokenType: 'VERDE' }))
        });
      } else if (greenToCreate < 0) {
        const unused = leader.tokens.filter(t => t.tokenType === 'VERDE' && !t.isUsed).slice(0, Math.abs(greenToCreate));
        if (unused.length > 0) await tx.ecdToken.deleteMany({ where: { id: { in: unused.map(t => t.id) } } });
      }

      return updatedLeader;
    });
  }

  // ==========================================
  // FICHAS / REGISTROS
  // ==========================================

  async getRegistrations() {
    return await prisma.ecdRegistration.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        leader: {
          include: { cell: true } // Inclui a célula para pegar o nome
        },
        edition: { select: { name: true } }
      }
    });
  }

  async updatePaymentStatus(id: string, status: string) {
    return await prisma.ecdRegistration.update({ where: { id }, data: { payment_status: status } });
  }

  async markAsCompleted(id: string, editionId: string) {
    return await prisma.ecdRegistration.update({ where: { id }, data: { status: 'CONCLUIDO', edition_id: editionId } });
  }

  async deleteRegistration(id: string) {
    const reg = await prisma.ecdRegistration.findUnique({ where: { id } });
    if (!reg) throw new Error("Ficha não encontrada.");

    return await prisma.$transaction(async (tx) => {
      await tx.ecdRegistration.delete({ where: { id } });

      // Devolve a cota pro líder se a ficha já estava ativa
      if (reg.status === 'ATIVO' && reg.leader_id && reg.ficha_type) {
        const field = reg.ficha_type === 'AMARELA' ? 'usedYellowSlots' : 'usedGreenSlots';
        await tx.ecdLeader.update({
          where: { id: reg.leader_id },
          data: { [field]: { decrement: 1 } }
        });
      }

      // Libera o token para ser usado de novo, caso o administrador tenha apagado a ficha de propósito
      if (reg.token_id) {
        await tx.ecdToken.update({
          where: { id: reg.token_id },
          data: { isUsed: false, usedAt: null }
        });
      }

      return { success: true };
    });
  }

  async approveRegistration(registrationId: string, leaderId: string, fichaType: 'AMARELA' | 'VERDE') {
    const leader = await prisma.ecdLeader.findUnique({
      where: { id: leaderId },
      include: { cell: true }
    });

    if (!leader) throw new Error("Líder não encontrado.");

    const availSlots = fichaType === 'AMARELA'
      ? leader.totalYellowSlots - leader.usedYellowSlots
      : leader.totalGreenSlots - leader.usedGreenSlots;

    if (availSlots <= 0) {
      // 👇 Protege contra célula nula usando o fallback
      throw new Error(`A origem ${leader.cell?.name ?? leader.name ?? 'Desconhecida'} não possui mais vagas disponíveis para fichas ${fichaType}s.`);
    }

    return await prisma.$transaction(async (tx) => {
      const updated = await tx.ecdRegistration.update({
        where: { id: registrationId },
        data: {
          status: 'ATIVO',
          leader_id: leaderId,
          ficha_type: fichaType
        }
      });

      const field = fichaType === 'AMARELA' ? 'usedYellowSlots' : 'usedGreenSlots';
      await tx.ecdLeader.update({
        where: { id: leaderId },
        data: { [field]: { increment: 1 } }
      });

      return updated;
    });
  }

  async uploadReceiptAdmin(id: string, file: any) {
    const reg = await prisma.ecdRegistration.findUnique({ where: { id } });
    if (!reg) throw new Error("Ficha não encontrada.");

    const receiptUrl = await uploadImage(file.filename, file.buffer, file.mimetype, 'ecd/receipts');

    return await prisma.ecdRegistration.update({
      where: { id },
      data: { receipt_photo_url: receiptUrl }
    });
  }

  async transferRegistrationLeader(registrationId: string, newLeaderId: string) {
    const reg = await prisma.ecdRegistration.findUnique({ where: { id: registrationId } });
    if (!reg) throw new Error("Ficha não encontrada.");

    if (!reg.leader_id || !reg.ficha_type) {
      return await prisma.ecdRegistration.update({
        where: { id: registrationId },
        data: { leader_id: newLeaderId }
      });
    }

    if (reg.leader_id === newLeaderId) return reg;

    const newLeader = await prisma.ecdLeader.findUnique({
      where: { id: newLeaderId },
      include: { cell: true }
    });
    if (!newLeader) throw new Error("Líder de destino não encontrado.");

    const field = reg.ficha_type === 'AMARELA' ? 'usedYellowSlots' : 'usedGreenSlots';
    const totalField = reg.ficha_type === 'AMARELA' ? 'totalYellowSlots' : 'totalGreenSlots';

    const availSlots = newLeader[totalField] - newLeader[field];
    if (availSlots <= 0) {
      // 👇 Mesmo esquema de proteção aqui
      throw new Error(`A origem ${newLeader.cell?.name ?? newLeader.name ?? 'Desconhecida'} não possui vagas disponíveis para fichas ${reg.ficha_type}s.`);
    }

    return await prisma.$transaction(async (tx) => {
      if (reg.status === 'ATIVO') {
        // Tira de um líder
        await tx.ecdLeader.update({
          where: { id: reg.leader_id },
          data: { [field]: { decrement: 1 } }
        });

        // Coloca no outro
        await tx.ecdLeader.update({
          where: { id: newLeaderId },
          data: { [field]: { increment: 1 } }
        });
      }

      if (reg.token_id) {
        await tx.ecdToken.update({
          where: { id: reg.token_id },
          data: { leaderId: newLeaderId } // Atualiza o token com o camelCase correto
        });
      }

      return await tx.ecdRegistration.update({
        where: { id: registrationId },
        data: { leader_id: newLeaderId }
      });
    });
  }

  // ==========================================
  // EDIÇÕES (GERAÇÃO AUTOMÁTICA)
  // ==========================================

  async getEditions() {
    return await prisma.ecdEdition.findMany({ orderBy: { created_at: 'desc' } });
  }

  async createEdition(data: EditionEcdType) {
    return await prisma.$transaction(async (tx) => {
      const edition = await tx.ecdEdition.create({
        data: {
          name: data.name,
          yellow_slots: data.yellowSlots,
          green_slots: data.greenSlots,
          worker_slots: data.workerSlots,
          encontristaPaymentLink: data.encontristaPaymentLink ?? null,
          workerPaymentLink: data.workerPaymentLink ?? null
        }
      });

      const activeCells = await tx.siteCell.findMany({
        where: { is_active: true },
        select: { id: true }
      });

      if (activeCells.length > 0) {
        const leadersToInsert = activeCells.map(cell => ({
          editionId: edition.id,
          cellId: cell.id,
          totalYellowSlots: 0,
          usedYellowSlots: 0,
          totalGreenSlots: 0,
          usedGreenSlots: 0
        }));

        await tx.ecdLeader.createMany({ data: leadersToInsert });
      }

      return edition;
    });
  }

  async updateEdition(id: string, data: EditionEcdType) {
    return await prisma.ecdEdition.update({
      where: { id },
      data: {
        name: data.name,
        yellow_slots: data.yellowSlots,
        green_slots: data.greenSlots,
        worker_slots: data.workerSlots,
        encontristaPaymentLink: data.encontristaPaymentLink ?? null,
        workerPaymentLink: data.workerPaymentLink ?? null
      }
    });
  }

  async deleteEdition(id: string) {
    return await prisma.ecdEdition.delete({ where: { id } });
  }

  async createLeaderWithTokens(name: string, yellowSlots: number, greenSlots: number) {
    const latestEdition = await prisma.ecdEdition.findFirst({ orderBy: { created_at: 'desc' } });
    if (!latestEdition) throw new Error("Nenhuma edição ativa encontrada.");

    return await prisma.$transaction(async (tx) => {
      // Cria o líder avulso, sem cellId
      const leader = await tx.ecdLeader.create({
        data: {
          name,
          editionId: latestEdition.id,
          totalYellowSlots: yellowSlots,
          totalGreenSlots: greenSlots
        }
      });

      // Já gera os links logo na criação
      if (yellowSlots > 0) {
        await tx.ecdToken.createMany({ data: Array.from({ length: yellowSlots }).map(() => ({ leaderId: leader.id, tokenType: 'AMARELA' })) });
      }
      if (greenSlots > 0) {
        await tx.ecdToken.createMany({ data: Array.from({ length: greenSlots }).map(() => ({ leaderId: leader.id, tokenType: 'VERDE' })) });
      }

      return leader;
    });
  }

  async deleteLeader(id: string) {
    return await prisma.ecdLeader.delete({ where: { id } });
  }

}