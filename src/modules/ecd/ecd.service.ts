// src/modules/ecd/ecd.service.ts
import { prisma } from '../../shared/database/prisma.js';
import { RegisterEcdType } from './ecd.schemas.js';
import { uploadImage } from '../../shared/storage/minio.js'; // 👈 Importação do MinIO adicionada

export class EcdService {

  // 👇 Agora recebe também a variável files 👇
  async createRegistration(data: RegisterEcdType, files: any) {
    // 1. Verificar se o Token existe e se AINDA É VÁLIDO
    const tokenRecord = await prisma.ecdToken.findUnique({
      where: { token_code: data.token }
    });

    if (!tokenRecord) throw new Error("TOKEN_NOT_FOUND");
    if (tokenRecord.is_used) throw new Error("TOKEN_ALREADY_USED");

    // 2. UPLOAD DAS FOTOS PARA O MINIO
    let profileUrl = null;
    let receiptUrl = null;

    if (files.profilePhoto) {
      profileUrl = await uploadImage(
        files.profilePhoto.filename,
        files.profilePhoto.buffer,
        files.profilePhoto.mimetype,
        'ecd/profiles' // Salva na pasta ecd/profiles no bucket
      );
    }

    if (files.receiptPhoto) {
      receiptUrl = await uploadImage(
        files.receiptPhoto.filename,
        files.receiptPhoto.buffer,
        files.receiptPhoto.mimetype,
        'ecd/receipts' // Salva na pasta ecd/receipts no bucket
      );
    }

    // 3. Transação do Prisma
    const result = await prisma.$transaction(async (tx) => {

      // A) Salva a Ficha
      const registration = await tx.ecdRegistration.create({
        data: {
          full_name: data.fullName,
          nickname: data.nickname ?? null,
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

          // URLs reais do MinIO
          profile_photo_url: profileUrl,
          receipt_photo_url: receiptUrl,

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

  async getLeaders() {
    return await prisma.ecdLeader.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        tokens: true
      }
    });
  }

  async getRegistrations() {
    return await prisma.ecdRegistration.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        leader: { select: { name: true } }
      }
    });
  }

  async createLeaderWithTokens(name: string, yellowSlots: number, greenSlots: number) {
    const leader = await prisma.ecdLeader.create({
      data: {
        name,
        total_yellow_slots: yellowSlots,
        total_green_slots: greenSlots,
      }
    });

    const yellowTokens = Array.from({ length: yellowSlots }).map(() => ({
      leader_id: leader.id,
      token_type: 'AMARELA'
    }));

    const greenTokens = Array.from({ length: greenSlots }).map(() => ({
      leader_id: leader.id,
      token_type: 'VERDE'
    }));

    await prisma.ecdToken.createMany({
      data: [...yellowTokens, ...greenTokens]
    });

    return leader;
  }

  async validateToken(tokenCode: string) {
    const token = await prisma.ecdToken.findUnique({
      where: { token_code: tokenCode },
      include: { leader: true }
    });

    if (!token) throw new Error("TOKEN_NOT_FOUND");
    if (token.is_used) throw new Error("TOKEN_ALREADY_USED");

    return {
      isValid: true,
      tokenType: token.token_type,
      leaderName: token.leader.name
    };
  }

  async updatePaymentStatus(id: string, status: string) {
    return await prisma.ecdRegistration.update({
      where: { id },
      data: { payment_status: status }
    });
  }

  async updateLeader(id: string, name: string, yellowSlots: number, greenSlots: number) {
    // 1. Busca o líder atual com todos os seus tokens
    const leader = await prisma.ecdLeader.findUnique({
      where: { id },
      include: { tokens: true }
    });

    if (!leader) throw new Error("Líder não encontrado.");

    // 2. Trava de segurança: Não pode reduzir a cota para um número menor do que o já utilizado
    if (yellowSlots < leader.used_yellow_slots) {
      throw new Error(`Não é possível reduzir fichas amarelas. Ele já utilizou ${leader.used_yellow_slots}.`);
    }
    if (greenSlots < leader.used_green_slots) {
      throw new Error(`Não é possível reduzir fichas verdes. Ele já utilizou ${leader.used_green_slots}.`);
    }

    const yellowDiff = yellowSlots - leader.total_yellow_slots;
    const greenDiff = greenSlots - leader.total_green_slots;

    // 3. Transação para atualizar os dados e reajustar os tokens (Links)
    return await prisma.$transaction(async (tx) => {

      const updatedLeader = await tx.ecdLeader.update({
        where: { id },
        data: {
          name,
          total_yellow_slots: yellowSlots,
          total_green_slots: greenSlots
        }
      });

      // 4. Ajuste das Fichas Amarelas (Cria ou Deleta tokens não usados)
      if (yellowDiff > 0) {
        const newTokens = Array.from({ length: yellowDiff }).map(() => ({ leader_id: id, token_type: 'AMARELA' }));
        await tx.ecdToken.createMany({ data: newTokens });
      } else if (yellowDiff < 0) {
        const unusedTokens = leader.tokens.filter(t => t.token_type === 'AMARELA' && !t.is_used);
        const tokensToDelete = unusedTokens.slice(0, Math.abs(yellowDiff)).map(t => t.id);
        await tx.ecdToken.deleteMany({ where: { id: { in: tokensToDelete } } });
      }

      // 5. Ajuste das Fichas Verdes (Cria ou Deleta tokens não usados)
      if (greenDiff > 0) {
        const newTokens = Array.from({ length: greenDiff }).map(() => ({ leader_id: id, token_type: 'VERDE' }));
        await tx.ecdToken.createMany({ data: newTokens });
      } else if (greenDiff < 0) {
        const unusedTokens = leader.tokens.filter(t => t.token_type === 'VERDE' && !t.is_used);
        const tokensToDelete = unusedTokens.slice(0, Math.abs(greenDiff)).map(t => t.id);
        await tx.ecdToken.deleteMany({ where: { id: { in: tokensToDelete } } });
      }

      return updatedLeader;
    });
  }

  async deleteLeader(id: string) {
    // O Prisma deletará o líder. Se houver CASCADE configurado para os tokens, eles sumirão juntos.
    // Se ele já tiver Inscrições ligadas a ele, retornará erro de Foreign Key que trataremos no controller.
    return await prisma.ecdLeader.delete({
      where: { id }
    });
  }

 async deleteRegistration(id: string) {
    // 1. Buscamos a ficha incluindo os dados relacionados para ter certeza do que estamos apagando
    const registration = await prisma.ecdRegistration.findUnique({
      where: { id }
    });

    if (!registration) {
      throw new Error("Ficha não encontrada no banco de dados.");
    }

    // 2. Transação Blindada
    return await prisma.$transaction(async (tx) => {
      
      // A) Apaga a ficha PRIMEIRO (Evita travas de foreign key)
      await tx.ecdRegistration.delete({ where: { id } });

      // B) Reativa o Link (Token) SOMENTE SE ele existir
      if (registration.token_id) {
        const tokenExists = await tx.ecdToken.findUnique({ where: { id: registration.token_id } });
        if (tokenExists) {
          await tx.ecdToken.update({
            where: { id: registration.token_id },
            data: { is_used: false } // O link volta a ficar ativo
          });
        }
      }

      // C) Devolve a cota para o Líder SOMENTE SE o líder existir
      if (registration.leader_id) {
        const leaderExists = await tx.ecdLeader.findUnique({ where: { id: registration.leader_id } });
        
        if (leaderExists) {
          if (registration.ficha_type === 'AMARELA') {
            // Garante que não vai ficar negativo
            if (leaderExists.used_yellow_slots > 0) {
              await tx.ecdLeader.update({
                where: { id: registration.leader_id },
                data: { used_yellow_slots: { decrement: 1 } }
              });
            }
          } else {
            // Garante que não vai ficar negativo
            if (leaderExists.used_green_slots > 0) {
              await tx.ecdLeader.update({
                where: { id: registration.leader_id },
                data: { used_green_slots: { decrement: 1 } }
              });
            }
          }
        }
      }

      return { success: true };
    });
  }
}