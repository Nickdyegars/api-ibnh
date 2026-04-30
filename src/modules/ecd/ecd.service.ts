// src/modules/ecd/ecd.service.ts
import { prisma } from '../../shared/database/prisma.js'; // Ajuste o caminho se necessário
import { RegisterEcdType } from './ecd.schemas.js';

export class EcdService {

  async createRegistration(data: RegisterEcdType) {
    // 1. Verificar se o Token existe e se AINDA É VÁLIDO
    const tokenRecord = await prisma.ecdToken.findUnique({
      where: { token_code: data.token }
    });

    if (!tokenRecord) {
      throw new Error("TOKEN_NOT_FOUND");
    }

    if (tokenRecord.is_used) {
      throw new Error("TOKEN_ALREADY_USED");
    }

    // 🔴 [ESPAÇO RESERVADO PARA AS FOTOS NO PRÓXIMO PASSO] 🔴
    const tempProfileUrl = "https://via.placeholder.com/150";
    const tempReceiptUrl = "https://via.placeholder.com/400x600";

    // 2. Transação do Prisma
    const result = await prisma.$transaction(async (tx) => {
      
      // A) Salva a Ficha
      const registration = await tx.ecdRegistration.create({
        data: {
          full_name: data.fullName,
          nickname: data.nickname ?? null, // 👈 Força null em vez de undefined
          phone: data.phone,
          gender: data.gender,
          age: data.age,
          address: data.address,
          is_married: data.isMarried,
          spouse_name: data.spouseName ?? null,
          relative_going: data.relativeGoing,
          relative_degree: data.relativeDegree ?? null,
          has_illness: data.hasIllness,
          illness_desc: data.illnessDesc ?? null,
          takes_medication: data.takesMedication,
          medication_desc: data.medicationDesc ?? null,
          dietary_restriction: data.dietaryRestriction,
          dietary_desc: data.dietaryDesc ?? null,
          shirt_size: data.shirtSize ?? null,
          emergency_contact: data.emergencyContact,
          emergency_phone: data.emergencyPhone,
          is_first_time: data.isFirstTime,
          in_cell: data.inCell,
          cell_leader_name: data.cellLeaderName ?? null,
          invited_by: data.invitedBy ?? null,
          
          profile_photo_url: tempProfileUrl,
          receipt_photo_url: tempReceiptUrl,

          ficha_type: tokenRecord.token_type,
          leader_id: tokenRecord.leader_id,
          token_id: tokenRecord.id
        }
      });

      // B) "Queima" o Token
      await tx.ecdToken.update({
        where: { id: tokenRecord.id },
        data: { is_used: true, usedAt: new Date() }
      });

      // C) Atualiza a contagem de fichas usadas do Líder
      if (tokenRecord.token_type === 'AMARELA') {
        await tx.ecdLeader.update({
          where: { id: tokenRecord.leader_id },
          data: { used_yellow_slots: { increment: 1 } }
        });
      } else {
        await tx.ecdLeader.update({
          where: { id: tokenRecord.leader_id },
          data: { used_green_slots: { increment: 1 } }
        });
      }

      return registration;
    });

    return result;
  }

  // Busca todos os líderes e os seus tokens para a Tabela 1
  async getLeaders() {
    return await prisma.ecdLeader.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        tokens: true // Traz os links gerados junto com o líder
      }
    });
  }

  // Busca todos os inscritos para a Tabela 2
  async getRegistrations() {
    return await prisma.ecdRegistration.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        leader: { select: { name: true } } // Traz o nome do líder responsável
      }
    });
  }

  // Cria um novo líder e gera a cota de links (Tokens)
  async createLeaderWithTokens(name: string, yellowSlots: number, greenSlots: number) {
    const leader = await prisma.ecdLeader.create({
      data: {
        name,
        total_yellow_slots: yellowSlots,
        total_green_slots: greenSlots,
      }
    });

    // Gera os Tokens Amarelos
    const yellowTokens = Array.from({ length: yellowSlots }).map(() => ({
      leader_id: leader.id,
      token_type: 'AMARELA'
    }));

    // Gera os Tokens Verdes
    const greenTokens = Array.from({ length: greenSlots }).map(() => ({
      leader_id: leader.id,
      token_type: 'VERDE'
    }));

    // Salva tudo no banco de uma vez
    await prisma.ecdToken.createMany({
      data: [...yellowTokens, ...greenTokens]
    });

    return leader;
  }
}