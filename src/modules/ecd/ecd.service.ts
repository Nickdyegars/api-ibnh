import { prisma } from '../../shared/database/prisma.js';
import { RegisterEcdType, EditionEcdType } from './ecd.schemas.js';
import { uploadImage, deleteImage } from '../../shared/storage/minio.js';
import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

function generateShortCode(length = 5): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export class EcdService {

  // ==========================================
  // INSCRIÇÃO E VALIDAÇÃO DE TOKENS (LINKS)
  // ==========================================

  async validateToken(tokenCode: string) {
    const tokenRecord = await prisma.ecdToken.findUnique({
      where: { id: tokenCode },
      include: {
        leader: {
          include: {
            cell: true,
            edition: true
          }
        }
      }
    });

    if (!tokenRecord) throw new Error("TOKEN_NOT_FOUND");
    if (tokenRecord.isUsed) throw new Error("TOKEN_ALREADY_USED");

    // 👇 Extraímos para uma variável fixa. O TS entende e blinda ela daqui para baixo!
    const leader = tokenRecord.leader;
    if (!leader) throw new Error("TOKEN_NOT_ACTIVATED");

    return {
      isValid: true,
      tokenType: tokenRecord.tokenType,
      leaderName: leader.cell
        ? `${leader.cell.leader} (${leader.cell.name})`
        : (leader.name ?? 'Sem Líder'),
      leaderId: leader.id, // 👈 Usamos leader.id em vez de tokenRecord.leaderId
      paymentLink: leader.edition?.encontristaPaymentLink ?? undefined // 👈 Mudado para undefined para bater com o seu Schema
    };
  }

  async createRegistration(data: RegisterEcdType, files: any) {
    const tokenRecord = await prisma.ecdToken.findUnique({
      where: { id: data.token },
      include: { leader: { include: { cell: true } } }
    });

    if (!tokenRecord) throw new Error("TOKEN_NOT_FOUND");
    if (tokenRecord.isUsed) throw new Error("TOKEN_ALREADY_USED");

    // 👇 Mesma estratégia de blindagem do TypeScript aqui
    const leader = tokenRecord.leader;
    if (!leader) throw new Error("Ficha inválida! Este QR Code ainda não foi ativado pela secretaria.");

    if (leader.editionId) {
      const edition = await prisma.ecdEdition.findUnique({
        where: { id: leader.editionId }
      });

      if (edition) {
        const totalMaximoPermitido = (edition.yellow_slots || 0) + (edition.green_slots || 0);

        const totalInscritosAtuais = await prisma.ecdRegistration.count({
          where: {
            leader: { editionId: edition.id },
            status: { in: ['ATIVO', 'PENDENTE'] }
          }
        });

        if (totalMaximoPermitido > 0 && totalInscritosAtuais >= totalMaximoPermitido) {
          throw new Error(`Inscrições encerradas! O limite máximo de ${totalMaximoPermitido} vagas para este Encontro foi atingido.`);
        }
      }
    }

    let profileUrl = null, receiptUrl = null;
    if (files.profilePhoto) profileUrl = await uploadImage(files.profilePhoto.filename, files.profilePhoto.buffer, files.profilePhoto.mimetype, 'ecd/profiles');
    if (files.receiptPhoto) receiptUrl = await uploadImage(files.receiptPhoto.filename, files.receiptPhoto.buffer, files.receiptPhoto.mimetype, 'ecd/receipts');

    return await prisma.$transaction(async (tx) => {
      const registration = await tx.ecdRegistration.create({
        data: {
          full_name: data.fullName,
          nickname: data.nickname ?? null, // 👈 Voltou para null
          phone: data.phone,
          gender: data.gender,
          age: data.age,
          address: data.address,
          is_married: data.isMarried,
          spouse_name: data.spouseName ?? null, // 👈 Voltou para null
          relative_going: data.relativeGoing,
          relative_degree: data.relativeDegree ?? null, // 👈 Voltou para null
          has_illness: data.hasIllness,
          illness_desc: data.illnessDesc ?? null, // 👈 Voltou para null
          takes_medication: data.takesMedication,
          medication_desc: data.medicationDesc ?? null, // 👈 Voltou para null
          dietary_restriction: data.dietaryRestriction,
          dietary_desc: data.dietaryDesc ?? null, // 👈 Voltou para null
          shirt_size: data.shirtSize ?? null, // 👈 Voltou para null
          emergency_contact: data.emergencyContact,
          emergency_phone: data.emergencyPhone,
          in_cell: data.inCell,

          cell_leader_name: leader.cell?.name ?? leader.name ?? 'Origem Desconhecida',
          invited_by: data.invitedBy ?? null, // 👈 Voltou para null
          profile_photo_url: profileUrl,
          receipt_photo_url: receiptUrl,
          spiritual_status: data.spiritualStatus ?? null, // 👈 Voltou para null

          status: 'PENDENTE',
          ficha_type: tokenRecord.tokenType,

          leader_id: leader.id,
          token_id: tokenRecord.id,
          edition_id: leader.editionId,

          lgpd_consent: data.lgpdConsent,
          lgpd_consent_date: data.lgpdConsentDate ? new Date(data.lgpdConsentDate) : new Date(),
          lgpd_terms_version: data.lgpdTermsVersion || '1.0'
        }
      });

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
        tokens: true,
        // 👇 INCLUÍMOS AS INSCRIÇÕES AQUI PARA SABER QUEM USOU O LINK
        registrations: { select: { token_id: true, full_name: true, status: true } }
      },
      orderBy: { cell: { name: 'asc' } }
    });

    return leaders.map(l => ({
      id: l.id,
      name: l.cell ? `${l.cell.leader} (${l.cell.name})` : (l.name ?? 'Sem Nome'),
      isExternal: !l.cell,
      total_yellow_slots: l.totalYellowSlots,
      used_yellow_slots: l.usedYellowSlots,
      total_green_slots: l.totalGreenSlots,
      used_green_slots: l.usedGreenSlots,
      tokens: l.tokens,
      // 👇 REPASSAMOS AS INSCRIÇÕES PARA O FRONTEND
      registrations: l.registrations
    }));
  }

  async updateLeader(id: string, name: string, yellowSlots: number, greenSlots: number) {
    const leader = await prisma.ecdLeader.findUnique({ where: { id } });
    if (!leader) throw new Error("Líder não encontrado.");

    if (yellowSlots < leader.usedYellowSlots || greenSlots < leader.usedGreenSlots) {
      throw new Error("Não é possível reduzir a cota abaixo do que já foi utilizado.");
    }

    await this._checkQuotaAvailability(leader.editionId, id, yellowSlots, greenSlots);

    // 👇 Simples e direto: Apenas atualiza a cota. Não gera mais links automáticos!
    return await prisma.ecdLeader.update({
      where: { id },
      data: { totalYellowSlots: yellowSlots, totalGreenSlots: greenSlots }
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

    // 👇 1. APAGA AS IMAGENS DO MINIO PRIMEIRO 👇
    try {
      if (reg.profile_photo_url) {
        await deleteImage(reg.profile_photo_url);
      }
      if (reg.receipt_photo_url) {
        await deleteImage(reg.receipt_photo_url);
      }
    } catch (err) {
      // Usamos um try-catch aqui para que, se a imagem já não existir no MinIO 
      // por algum motivo, o sistema não trave e continue a apagar do banco.
      console.warn(`[MinIO] Aviso ao deletar imagens da ficha ${id}:`, err);
    }

    // 2. TRANSAÇÃO: APAGA DO BANCO E DEVOLVE AS COTAS/TOKENS
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
          data: { isUsed: false, usedAt: null } // Volta o token para o estado virgem
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
          workerPaymentLink: data.workerPaymentLink ?? null,
          is_active: true
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
    return await prisma.$transaction(async (tx) => {

      // 1. Busca todos os líderes atrelados a esta edição
      const leaders = await tx.ecdLeader.findMany({
        where: { editionId: id },
        select: { id: true }
      });
      const leaderIds = leaders.map(l => l.id);

      if (leaderIds.length > 0) {

        // 2. Busca todas as inscrições PENDENTES destes líderes
        const pendingRegistrations = await tx.ecdRegistration.findMany({
          where: {
            leader_id: { in: leaderIds },
            status: 'PENDENTE'
          }
        });

        // 3. Apaga as fotos e comprovantes do MinIO (Limpeza de lixo)
        for (const reg of pendingRegistrations) {
          try {
            if (reg.profile_photo_url) await deleteImage(reg.profile_photo_url);
            if (reg.receipt_photo_url) await deleteImage(reg.receipt_photo_url);
          } catch (err) {
            console.warn(`[MinIO] Erro ao deletar mídia da ficha pendente ${reg.id}`, err);
          }
        }

        // 4. Apaga as inscrições PENDENTES do banco de dados
        if (pendingRegistrations.length > 0) {
          await tx.ecdRegistration.deleteMany({
            where: { id: { in: pendingRegistrations.map(r => r.id) } }
          });
        }

        // 5. Apaga os links (tokens) gerados para estes líderes
        await tx.ecdToken.deleteMany({
          where: { leaderId: { in: leaderIds } }
        });

        // 6. Apaga os Líderes desta edição
        // NOTA: Se houver alguma ficha ATIVA ou CONCLUÍDA atrelada a este líder, 
        // o Prisma vai disparar o erro P2003 aqui, abortando a exclusão e protegendo o histórico!
        await tx.ecdLeader.deleteMany({
          where: { editionId: id }
        });
      }

      // 7. Por fim, apaga a Edição
      return await tx.ecdEdition.delete({ where: { id } });
    });
  }

  async createLeader(name: string, yellowSlots: number, greenSlots: number) {
    const latestEdition = await prisma.ecdEdition.findFirst({ orderBy: { created_at: 'desc' } });
    if (!latestEdition) throw new Error("Nenhuma edição ativa encontrada.");

    await this._checkQuotaAvailability(latestEdition.id, null, yellowSlots, greenSlots);

    // 👇 Apenas cria o líder. Os tokens serão ativados via bip da secretaria.
    return await prisma.ecdLeader.create({
      data: {
        name,
        editionId: latestEdition.id,
        totalYellowSlots: yellowSlots,
        totalGreenSlots: greenSlots
      }
    });
  }

  async deleteLeader(id: string) {
    return await prisma.ecdLeader.delete({ where: { id } });
  }

  private async _checkQuotaAvailability(editionId: string, leaderIdToIgnore: string | null, reqYellow: number, reqGreen: number) {
    const edition = await prisma.ecdEdition.findUnique({ where: { id: editionId } });
    if (!edition) throw new Error("Edição não encontrada.");

    // Busca todos os líderes desta edição (ignorando o líder atual se for uma atualização)
    const otherLeaders = await prisma.ecdLeader.findMany({
      where: {
        editionId: editionId,
        ...(leaderIdToIgnore ? { id: { not: leaderIdToIgnore } } : {})
      }
    });

    const yellowAllocated = otherLeaders.reduce((sum, l) => sum + (l.totalYellowSlots || 0), 0);
    const greenAllocated = otherLeaders.reduce((sum, l) => sum + (l.totalGreenSlots || 0), 0);

    const availableYellow = edition.yellow_slots - yellowAllocated;
    const availableGreen = edition.green_slots - greenAllocated;

    if (reqYellow > availableYellow) {
      throw new Error(`Cota Amarela indisponível! O evento possui apenas ${availableYellow} vagas amarelas livres para distribuição.`);
    }

    if (reqGreen > availableGreen) {
      throw new Error(`Cota Verde indisponível! O evento possui apenas ${availableGreen} vagas verdes livres para distribuição.`);
    }
  }

  async generateTokensAndPdf(amountYellow: number, amountGreen: number, editionId: string) {
    const tokensToCreate: {
      id: string;
      shortCode: string;
      tokenType: string;
      isUsed: boolean;
      editionId?: string;
    }[] = [];

    // 1. Prepara os Lotes com UUIDs gerados aqui no Node
    for (let i = 0; i < amountYellow; i++) {
      tokensToCreate.push({
        id: crypto.randomUUID(),
        shortCode: generateShortCode(5),
        tokenType: 'AMARELA',
        isUsed: false,
        editionId: editionId // Amarra os tokens à edição atual!
      });
    }

    for (let i = 0; i < amountGreen; i++) {
      tokensToCreate.push({
        id: crypto.randomUUID(),
        shortCode: generateShortCode(5),
        tokenType: 'VERDE',
        isUsed: false,
        editionId: editionId
      });
    }

    // 2. Salva no banco de dados
    await prisma.ecdToken.createMany({
      data: tokensToCreate,
      skipDuplicates: true
    });

    // 3. Monta o PDF
    const doc = new PDFDocument({ size: 'A4', margin: 30 });
    const rowHeight = 230;
    const startY = 40;

    for (let index = 0; index < tokensToCreate.length; index++) {
      const token = tokensToCreate[index];

      if (!token) continue;

      if (index > 0 && index % 3 === 0) doc.addPage();

      const currentY = startY + (index % 3) * rowHeight;
      const colorHex = token.tokenType === 'AMARELA' ? '#eab308' : '#16a34a';

      // Design do Voucher
      doc.rect(30, currentY, 535, 210).strokeColor('#cbd5e1').lineWidth(1).stroke();
      doc.rect(30, currentY, 150, 25).fill(colorHex);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10).text(`CANHOTO - ${token.tokenType}`, 35, currentY + 7);

      doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(22).text(token.shortCode, 45, currentY + 45);
      doc.font('Helvetica').fontSize(8).fillColor('#64748b').text('CÓDIGO DE ATIVAÇÃO', 45, currentY + 70);

      // QR Code da Secretaria
      const secretQrBuffer = await QRCode.toBuffer(token.shortCode, { margin: 1, width: 90 });
      doc.image(secretQrBuffer, 60, currentY + 95, { width: 90 });

      // Linha Serrilhada
      doc.moveTo(180, currentY).lineTo(180, currentY + 210).dash(4, { space: 4 }).strokeColor('#94a3b8').stroke();
      doc.undash();

      // Ficha do Encontrista
      doc.rect(180, currentY, 385, 25).fill(colorHex);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11).text('ENCONTRO COM DEUS - INSCRIÇÃO', 195, currentY + 7);

      doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(12).text('Instruções:', 195, currentY + 45);
      doc.font('Helvetica').fontSize(9).fillColor('#334155')
        .text('1. Aponte a câmera do celular para o QR Code.', 195, currentY + 65)
        .text('2. Preencha o formulário e anexe o comprovante.', 195, currentY + 80)
        .text(`3. ID de Segurança: ${token.shortCode}`, 195, currentY + 100);

      // QR Code Público
      // 1. Ele tenta ler o link do arquivo .env. Se não achar, usa o localhost como segurança.
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5174';

      // 2. Monta o link dinâmico juntando a URL base com a tela de cadastro e o ID da ficha
      const publicUrl = `${baseUrl}/ecd/cadastro?token=${token.id}`;

      // 3. Desenha o QR Code no PDF
      const publicQrBuffer = await QRCode.toBuffer(publicUrl, { margin: 1, width: 120 });
      doc.image(publicQrBuffer, 435, currentY + 45, { width: 120 });
      doc.image(publicQrBuffer, 435, currentY + 45, { width: 120 });
    }

    doc.end();
    return doc; // Retorna o arquivo gerado para o Controller
  }

  async activateVoucher(shortCode: string, leaderId: string) {
    // 1. Busca a ficha pelo código digitado/bipado
    const token = await prisma.ecdToken.findUnique({
      where: { shortCode: shortCode.toUpperCase() }
    });

    if (!token) {
      throw new Error("Código inválido! Ficha não encontrada no sistema.");
    }

    if (token.isUsed) {
      throw new Error("Esta ficha já foi utilizada por um encontrista!");
    }

    if (token.leaderId) {
      throw new Error("Esta ficha já foi ativada e entregue para um líder anteriormente.");
    }

    // 2. Verifica se o líder destino existe
    const leader = await prisma.ecdLeader.findUnique({
      where: { id: leaderId }
    });

    if (!leader) {
      throw new Error("Líder não encontrado para vinculação.");
    }

    // 3. Executa a vinculação e sobe a cota do líder na mesma transação
    return await prisma.$transaction(async (tx) => {
      const activatedToken = await tx.ecdToken.update({
        where: { id: token.id },
        data: { leaderId: leader.id }
      });

      const field = token.tokenType === 'AMARELA' ? 'totalYellowSlots' : 'totalGreenSlots';
      await tx.ecdLeader.update({
        where: { id: leader.id },
        data: { [field]: { increment: 1 } }
      });

      return activatedToken;
    });
  }

}