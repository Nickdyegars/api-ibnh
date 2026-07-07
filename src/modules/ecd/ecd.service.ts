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
      include: { edition: true }
    });

    if (!tokenRecord) throw new Error("TOKEN_NOT_FOUND");
    if (tokenRecord.isUsed) throw new Error("TOKEN_ALREADY_USED");

    // Retorna apenas a cor da ficha para o Front-end saber como pintar a tela
    return {
      isValid: true,
      tokenType: tokenRecord.tokenType,
      paymentLink: tokenRecord.edition?.encontristaPaymentLink ?? undefined
    };
  }

  async createRegistration(data: any, files: any) {
    // 1. Busca a Ficha e vê se é válida
    const tokenRecord = await prisma.ecdToken.findUnique({ where: { id: data.token } });
    if (!tokenRecord) throw new Error("TOKEN_NOT_FOUND");
    if (tokenRecord.isUsed) throw new Error("TOKEN_ALREADY_USED");

    // 2. Busca o Líder pelo PIN que o usuário digitou
    const leader = await prisma.ecdLeader.findUnique({
      where: { inviteCode: data.inviteCode.toUpperCase() },
      include: { cell: true }
    });

    if (!leader) throw new Error("Código de líder inválido. Verifique o PIN fornecido.");
    if (leader.editionId !== tokenRecord.editionId) throw new Error("Este código de líder pertence a outra edição do evento.");

    // 3. Checa as Vagas do LÍDER (A trava de segurança que conversamos)
    // const availableSlots = tokenRecord.tokenType === 'AMARELA'
    //   ? leader.totalYellowSlots - leader.usedYellowSlots
    //   : leader.totalGreenSlots - leader.usedGreenSlots;

    // if (availableSlots <= 0) {
    //   throw new Error(`O líder/origem (${leader.inviteCode}) não possui mais vagas para fichas ${tokenRecord.tokenType}s.`);
    // }

    // 4. Salva Imagens
    let profileUrl = null, receiptUrl = null;
    if (files.profilePhoto) profileUrl = await uploadImage(files.profilePhoto.filename, files.profilePhoto.buffer, files.profilePhoto.mimetype, 'ecd/profiles');
    if (files.receiptPhoto) receiptUrl = await uploadImage(files.receiptPhoto.filename, files.receiptPhoto.buffer, files.receiptPhoto.mimetype, 'ecd/receipts');

    // 5. Salva Tudo em Cascata
    return await prisma.$transaction(async (tx) => {
      // A) Cria Inscrição
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
          in_cell: data.inCell,

          cell_leader_name: leader.cell?.name ?? leader.name ?? 'Origem Desconhecida',
          invited_by: data.invitedBy ?? null,
          profile_photo_url: profileUrl,
          receipt_photo_url: receiptUrl,
          spiritual_status: data.spiritualStatus ?? null,

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

      // B) Vincula a ficha ao líder e queima ela
      await tx.ecdToken.update({
        where: { id: tokenRecord.id },
        data: { isUsed: true, usedAt: new Date(), leaderId: leader.id }
      });

      // C) Desconta a Vaga do Líder (Pendente já gasta vaga)
      const field = tokenRecord.tokenType === 'AMARELA' ? 'usedYellowSlots' : 'usedGreenSlots';
      await tx.ecdLeader.update({
        where: { id: leader.id },
        data: { [field]: { increment: 1 } }
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
      inviteCode: l.inviteCode,
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
    const editions = await prisma.ecdEdition.findMany({ orderBy: { created_at: 'desc' } });

    // 👇 NOVO: Conta quantas fichas físicas já foram geradas (impressas) para cada edição
    const editionsWithCounts = await Promise.all(editions.map(async (ed) => {
      const printedYellow = await prisma.ecdToken.count({ where: { editionId: ed.id, tokenType: 'AMARELA' } });
      const printedGreen = await prisma.ecdToken.count({ where: { editionId: ed.id, tokenType: 'VERDE' } });

      return {
        ...ed,
        printedYellow,
        printedGreen
      };
    }));

    return editionsWithCounts;
  }

  async createEdition(data: EditionEcdType) {
    return await prisma.$transaction(async (tx) => {
      const edition = await tx.ecdEdition.create({ data: { /* seus dados aqui, não mudei nada */ name: data.name, yellow_slots: data.yellowSlots, green_slots: data.greenSlots, worker_slots: data.workerSlots, encontristaPaymentLink: data.encontristaPaymentLink ?? null, workerPaymentLink: data.workerPaymentLink ?? null, is_active: true } });

      const activeCells = await tx.siteCell.findMany({ where: { is_active: true }, select: { id: true } });

      if (activeCells.length > 0) {
        const leadersToInsert = activeCells.map(cell => ({
          editionId: edition.id,
          cellId: cell.id,
          totalYellowSlots: 0,
          usedYellowSlots: 0,
          totalGreenSlots: 0,
          usedGreenSlots: 0,
          inviteCode: generateShortCode(5).toUpperCase() // 👇 ADICIONADO AQUI
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

    return await prisma.ecdLeader.create({
      data: {
        name,
        editionId: latestEdition.id,
        totalYellowSlots: yellowSlots,
        totalGreenSlots: greenSlots,
        inviteCode: generateShortCode(5).toUpperCase() // 👇 ADICIONADO AQUI
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

  // ==========================================
  // GERAÇÃO DE LOTE E PDF COM TRAVA DE EDIÇÃO
  // ==========================================
  async generateTokensAndPdf(amountYellow: number, amountGreen: number, editionId: string) {

    // 1. TRAVA DE SEGURANÇA E LIMITES
    const edition = await prisma.ecdEdition.findUnique({ where: { id: editionId } });
    if (!edition) throw new Error("Edição não encontrada.");

    const alreadyYellow = await prisma.ecdToken.count({ where: { editionId, tokenType: 'AMARELA' } });
    const alreadyGreen = await prisma.ecdToken.count({ where: { editionId, tokenType: 'VERDE' } });

    if (alreadyYellow + amountYellow > edition.yellow_slots) {
      throw new Error(`Limite excedido! A edição permite ${edition.yellow_slots} amarelas. Já imprimimos ${alreadyYellow}. Você só pode gerar mais ${edition.yellow_slots - alreadyYellow}.`);
    }

    if (alreadyGreen + amountGreen > edition.green_slots) {
      throw new Error(`Limite excedido! A edição permite ${edition.green_slots} verdes. Já imprimimos ${alreadyGreen}. Você só pode gerar mais ${edition.green_slots - alreadyGreen}.`);
    }

    // 2. GERAÇÃO DOS TOKENS (USO ÚNICO)
    const tokensToCreate: { id: string; shortCode: string; tokenType: string; isUsed: boolean; editionId?: string; }[] = [];

    for (let i = 0; i < amountYellow; i++) {
      tokensToCreate.push({ id: crypto.randomUUID(), shortCode: generateShortCode(5), tokenType: 'AMARELA', isUsed: false, editionId: editionId });
    }

    for (let i = 0; i < amountGreen; i++) {
      tokensToCreate.push({ id: crypto.randomUUID(), shortCode: generateShortCode(5), tokenType: 'VERDE', isUsed: false, editionId: editionId });
    }

    await prisma.ecdToken.createMany({ data: tokensToCreate, skipDuplicates: true });

    // 3. DESENHO DO NOVO PDF (1 QR CODE + ESPAÇO PARA O PIN)
    const doc = new PDFDocument({ size: 'A4', margin: 30 });
    const rowHeight = 230;
    const startY = 40;
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5174';

    for (let index = 0; index < tokensToCreate.length; index++) {
      const token = tokensToCreate[index];
      if (!token) continue;

      if (index > 0 && index % 3 === 0) doc.addPage();

      const currentY = startY + (index % 3) * rowHeight;
      const colorHex = token.tokenType === 'AMARELA' ? '#eab308' : '#16a34a';

      // Borda Externa da Ficha
      doc.rect(30, currentY, 535, 210).strokeColor('#cbd5e1').lineWidth(1).stroke();

      // Faixa Superior Colorida
      doc.rect(30, currentY, 535, 35).fill(colorHex);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14).text(`ENCONTRO COM DEUS - FICHA ${token.tokenType}`, 45, currentY + 12);

      // Texto de Instruções (Lado Esquerdo)
      doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(12).text('COMO SE INSCREVER:', 45, currentY + 55);
      doc.font('Helvetica').fontSize(10).fillColor('#334155')
        .text('1. Aponte a câmera do celular para o QR Code ao lado.', 45, currentY + 75)
        .text('2. Preencha o formulário e anexe o seu comprovante.', 45, currentY + 95)
        .text('3. Digite o PIN do seu líder (anotado na caixa abaixo).', 45, currentY + 115);

      // Caixa para o Líder escrever o PIN a caneta
      doc.rect(45, currentY + 145, 300, 50).fillAndStroke('#f8fafc', '#94a3b8');
      doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(10).text('CÓDIGO DO LÍDER (PIN):', 55, currentY + 155);
      doc.fillColor('#cbd5e1').font('Helvetica-Bold').fontSize(14).text('ESCREVA O PIN AQUI', 55, currentY + 172);

      // QR Code Único (Lado Direito)
      const publicUrl = `${baseUrl}/ecd/cadastro?token=${token.id}`;
      const publicQrBuffer = await QRCode.toBuffer(publicUrl, { margin: 1, width: 140 });

      doc.image(publicQrBuffer, 400, currentY + 45, { width: 140 });

      // ID de Segurança (Rodapé do QR Code)
      doc.font('Helvetica').fontSize(8).fillColor('#94a3b8').text(`ID: ${token.shortCode} | Link de uso único`, 400, currentY + 190, { align: 'center', width: 140 });
    }

    doc.end();
    return doc;
  }

  // ==========================================
  // RELATÓRIO DE CÓDIGOS DE CONVITE (PIN)
  // ==========================================
  async generateLeadersCodesPdf(editionId: string) {
    const edition = await prisma.ecdEdition.findUnique({ where: { id: editionId } });
    if (!edition) throw new Error("Edição não encontrada.");

    const leaders = await prisma.ecdLeader.findMany({
      where: { editionId },
      include: { cell: true },
      orderBy: { name: 'asc' }
    });

    const doc = new PDFDocument({ size: 'A4', margin: 40 });

    // Cabeçalho
    doc.fillColor('#1e3a8a').fontSize(18).font('Helvetica-Bold').text('CÓDIGOS DOS LÍDERES (PIN)', { align: 'center' });
    doc.fillColor('#475569').fontSize(12).font('Helvetica').text(`Edição: ${edition.name}`, { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(10).text('Entregue estes códigos aos líderes. Os encontristas deverão digitar o código exato no site no momento da inscrição.', { align: 'center' });
    doc.moveDown(2);

    // Tabela Simples
    leaders.forEach(l => {
      const name = l.cell ? `${l.cell.leader} (${l.cell.name})` : l.name;

      doc.rect(40, doc.y, 515, 30).fill('#f8fafc').strokeColor('#cbd5e1').lineWidth(1).stroke();
      doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(11).text(name || 'Desconhecido', 50, doc.y + 10);
      doc.fillColor('#16a34a').font('Helvetica-Bold').fontSize(14).text(l.inviteCode, 450, doc.y - 12);

      doc.moveDown(1.5);
    });

    doc.end();
    return doc;
  }

  async validatePin(inviteCode: string, tokenId: string) {
    const token = await prisma.ecdToken.findUnique({ where: { id: tokenId } });
    if (!token) throw new Error("Ficha não encontrada no sistema.");
    if (token.isUsed) throw new Error("Esta ficha já foi utilizada por outra pessoa.");

    const leader = await prisma.ecdLeader.findUnique({
      where: { inviteCode: inviteCode.toUpperCase() },
      include: { cell: true }
    });

    if (!leader) throw new Error("Código (PIN) inválido. Verifique se digitou corretamente.");
    if (leader.editionId !== token.editionId) throw new Error("Este PIN pertence a outra edição do evento.");

    // 👇 REMOVEMOS A CHECAGEM DE COTA AQUI 👇

    return {
      isValid: true,
      leaderName: leader.cell?.name ?? leader.name
    };
  }
}