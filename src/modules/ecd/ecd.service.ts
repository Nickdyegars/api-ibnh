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
      orderBy: { created_at: 'desc' } // Certifique-se de usar o camelCase aqui também, se aplicável
    });

    if (!latestEdition) return [];

    // 1. Busca os líderes
    const leaders = await prisma.ecdLeader.findMany({
      where: { editionId: latestEdition.id },
      include: {
        cell: { select: { leader: true } }
      }
    });

    // 2. Busca TODAS as inscrições reais desta edição
    const registrations = await prisma.ecdRegistration.findMany({
      where: { edition_id: latestEdition.id },
      select: { leader_id: true, status: true, ficha_type: true }
    });

    // 3. Monta o pacote de dados com a contagem exata
    return leaders.map(l => {
      // Filtra as inscrições que pertencem a este líder
      const lRegs = registrations.filter(r => r.leader_id === l.id);

      return {
        id: l.id,
        name: l.cell?.leader || l.name || 'Líder Não Identificado',
        isExternal: !l.cell,
        inviteCode: l.inviteCode,

        // Contagem Amarela
        yellow_pending: lRegs.filter(r => r.ficha_type === 'AMARELA' && r.status === 'PENDENTE').length,
        yellow_approved: lRegs.filter(r => r.ficha_type === 'AMARELA' && r.status === 'ATIVO').length,

        // Contagem Verde
        green_pending: lRegs.filter(r => r.ficha_type === 'VERDE' && r.status === 'PENDENTE').length,
        green_approved: lRegs.filter(r => r.ficha_type === 'VERDE' && r.status === 'ATIVO').length,
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
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
    const registration = await prisma.ecdRegistration.findUnique({
      where: { id: registrationId }
    });

    if (!registration) throw new Error("Ficha não encontrada.");

    // Como a vaga já foi devidamente descontada e o líder já foi atrelado 
    // no momento do cadastro (createRegistration), a aprovação agora apenas 
    // altera o status da ficha de 'PENDENTE' para 'ATIVO', sem dupla contagem!
    return await prisma.ecdRegistration.update({
      where: { id: registrationId },
      data: {
        status: 'ATIVO'
      }
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

    // 👇 REMOVIDA A VERIFICAÇÃO DE COTA INDIVIDUAL AQUI TAMBÉM 👇

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
          data: { leaderId: newLeaderId }
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

      // 👇 1. Agora buscamos o ID e o NOME DO LÍDER da célula
      const activeCells = await tx.siteCell.findMany({
        // where: { is_active: true },
        select: { id: true, leader: true }
      });

      if (activeCells.length > 0) {
        const leadersToInsert = activeCells.map(cell => ({
          editionId: edition.id,
          cellId: cell.id,
          name: cell.leader, // 👈 2. Salva APENAS o nome do líder diretamente no banco!
          totalYellowSlots: 0,
          usedYellowSlots: 0,
          totalGreenSlots: 0,
          usedGreenSlots: 0,
          inviteCode: generateShortCode(5).toUpperCase()
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

    // Variáveis para controlar a numeração sequencial das fichas
    let currentYellowNumber = alreadyYellow;
    let currentGreenNumber = alreadyGreen;

    for (let index = 0; index < tokensToCreate.length; index++) {
      const token = tokensToCreate[index];
      if (!token) continue;

      if (index > 0 && index % 3 === 0) doc.addPage();

      const currentY = startY + (index % 3) * rowHeight;
      const colorHex = token.tokenType === 'AMARELA' ? '#eab308' : '#16a34a';

      // Define o número sequencial para esta ficha específica
      let seqNumber = 0;
      if (token.tokenType === 'AMARELA') {
        currentYellowNumber++;
        seqNumber = currentYellowNumber;
      } else {
        currentGreenNumber++;
        seqNumber = currentGreenNumber;
      }

      // Borda Externa da Ficha
      doc.rect(30, currentY, 535, 210).strokeColor('#cbd5e1').lineWidth(1).stroke();

      // Faixa Superior Colorida com o NÚMERO SEQUENCIAL
      doc.rect(30, currentY, 535, 35).fill(colorHex);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14).text(`ENCONTRO COM DEUS - FICHA ${token.tokenType} Nº ${seqNumber}`, 45, currentY + 12);

      // Texto de Instruções (Lado Esquerdo)
      doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(12).text('COMO SE INSCREVER:', 45, currentY + 55);
      doc.font('Helvetica').fontSize(10).fillColor('#334155')
        .text('1. Aponte a câmera do celular para o QR Code ao lado.', 45, currentY + 75)
        .text('2. Preencha o formulário.', 45, currentY + 95)
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
    const leaders = await prisma.ecdLeader.findMany({
      where: { editionId },
      include: { cell: true },
      orderBy: { name: 'asc' } // Se o seu campo for 'name'
    });

    if (leaders.length === 0) {
      throw new Error("Nenhum líder encontrado para esta edição.");
    }

    const doc = new PDFDocument({ size: 'A4', margin: 40 });

    // Cabeçalho do Relatório
    doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(18).text('RELATÓRIO DE CÓDIGOS (PIN) - ECD', { align: 'center' });
    doc.fontSize(10).font('Helvetica').fillColor('#64748b').text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, { align: 'center' });
    doc.moveDown(2);

    // Linha de Cabeçalho da Tabela
    let currentY = doc.y;
    doc.rect(40, currentY, 515, 24).fill('#334155');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10)
      .text('LÍDER / ORIGEM', 50, currentY + 7, { width: 180 })
      .text('CÓDIGO (PIN)', 240, currentY + 7, { width: 90, align: 'center' })
      .text('FICHAS ENTREGUES', 340, currentY + 7, { width: 200, align: 'center' });

    doc.moveDown(0.8);

    // Listagem dos Líderes
    leaders.forEach((leader) => {
      // Se estourar a página, cria uma nova e redesenha o topo
      if (doc.y > 720) {
        doc.addPage();
        currentY = doc.y;
        doc.rect(40, currentY, 515, 24).fill('#334155');
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10)
          .text('LÍDER / ORIGEM', 50, currentY + 7, { width: 180 })
          .text('CÓDIGO (PIN)', 240, currentY + 7, { width: 90, align: 'center' })
          .text('FICHAS ENTREGUES', 340, currentY + 7, { width: 200, align: 'center' });
        doc.moveDown(0.8);
      }

      const rowY = doc.y;
      const displayName = leader.cell?.leader || leader.name || 'Líder Não Identificado';

      // Nome do Líder
      doc.fillColor('#334155').font('Helvetica').fontSize(10).text(displayName, 50, rowY + 8, { width: 180 });

      // Caixa de Destaque do PIN
      doc.rect(240, rowY + 3, 90, 20).fillAndStroke('#f1f5f9', '#cbd5e1');
      doc.fillColor('#16a34a').font('Helvetica-Bold').fontSize(11).text(leader.inviteCode || 'N/A', 240, rowY + 8, { width: 90, align: 'center' });

      // 👇 AS CAIXAS EM BRANCO PARA ANOTAÇÃO A MÃO 👇
      // Caixa Amarela
      doc.rect(345, rowY + 3, 90, 20).strokeColor('#fef08a').lineWidth(1).stroke();
      doc.fillColor('#a16207').font('Helvetica-Bold').fontSize(9).text('AM: _______', 355, rowY + 9);

      // Caixa Verde
      doc.rect(445, rowY + 3, 90, 20).strokeColor('#bbf7d0').lineWidth(1).stroke();
      doc.fillColor('#15803d').font('Helvetica-Bold').fontSize(9).text('VD: _______', 455, rowY + 9);

      // Linha sutil divisória de registro
      doc.moveTo(40, rowY + 28).lineTo(555, rowY + 28).strokeColor('#e2e8f0').lineWidth(0.5).stroke();

      doc.y = rowY + 32; // Avança o cursor para a próxima linha
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
      leaderName: leader.cell?.leader ?? leader.name
    };
  }

  // ==========================================
  // REIMPRESSÃO DE FICHAS NÃO UTILIZADAS
  // ==========================================
  async reprintTokensPdf(editionId: string) {
    // 1. Busca TODAS as fichas da edição em ordem de criação para descobrirmos o número original
    const allTokens = await prisma.ecdToken.findMany({
      where: { editionId: editionId },
      orderBy: [
        { createdAt: 'asc' }, // Primeiro organiza por tempo
        { id: 'asc' }         // 👈 O DESEMPATE: Se o tempo for igual, organiza por ID (Ordem alfabética do código)
      ]
    });

    if (allTokens.length === 0) {
      throw new Error("Não existem fichas geradas para esta edição.");
    }

    // 2. Filtra apenas as que não foram usadas, mas já "carimbadas" com o número original delas
    const tokensToPrint: any[] = [];
    let countYellow = 0;
    let countGreen = 0;

    for (const token of allTokens) {
      let originalNumber = 0;

      // Conta todas as fichas (usadas ou não) para manter a sequência matemática perfeita
      if (token.tokenType === 'AMARELA') {
        countYellow++;
        originalNumber = countYellow;
      } else if (token.tokenType === 'VERDE') {
        countGreen++;
        originalNumber = countGreen;
      }

      // Se a ficha AINDA NÃO foi usada, vai para a fila de impressão com o seu número!
      if (token.isUsed === false) {
        tokensToPrint.push({ ...token, originalNumber });
      }
    }

    if (tokensToPrint.length === 0) {
      throw new Error("Todas as fichas impressas desta edição já foram utilizadas!");
    }

    // Ordena para imprimir primeiro as Amarelas, depois as Verdes
    tokensToPrint.sort((a, b) => a.tokenType.localeCompare(b.tokenType));

    // 3. DESENHO DO PDF
    const doc = new PDFDocument({ size: 'A4', margin: 30 });
    const rowHeight = 230;
    const startY = 40;
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5174';

    for (let index = 0; index < tokensToPrint.length; index++) {
      const token = tokensToPrint[index];
      if (!token) continue;

      if (index > 0 && index % 3 === 0) doc.addPage();

      const currentY = startY + (index % 3) * rowHeight;
      const colorHex = token.tokenType === 'AMARELA' ? '#eab308' : '#16a34a';

      // Borda Externa
      doc.rect(30, currentY, 535, 210).strokeColor('#cbd5e1').lineWidth(1).stroke();

      // 👇 MÁGICA AQUI: Faixa Superior Colorida com o NÚMERO ORIGINAL 👇
      doc.rect(30, currentY, 535, 35).fill(colorHex);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14).text(`ENCONTRO COM DEUS - FICHA ${token.tokenType} Nº ${token.originalNumber} (REIMPRESSÃO)`, 45, currentY + 12);

      // Instruções
      doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(12).text('COMO SE INSCREVER:', 45, currentY + 55);
      doc.font('Helvetica').fontSize(10).fillColor('#334155')
        .text('1. Aponte a câmera do celular para o QR Code ao lado.', 45, currentY + 75)
        .text('2. Preencha o formulário.', 45, currentY + 95)
        .text('3. Digite o PIN do seu líder (anotado na caixa abaixo).', 45, currentY + 115);

      // Caixa do PIN
      doc.rect(45, currentY + 145, 300, 50).fillAndStroke('#f8fafc', '#94a3b8');
      doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(10).text('CÓDIGO DO LÍDER (PIN):', 55, currentY + 155);
      doc.fillColor('#cbd5e1').font('Helvetica-Bold').fontSize(14).text('ESCREVA O PIN AQUI', 55, currentY + 172);

      // QR Code
      const publicUrl = `${baseUrl}/ecd/cadastro?token=${token.id}`;
      const publicQrBuffer = await QRCode.toBuffer(publicUrl, { margin: 1, width: 140 });
      doc.image(publicQrBuffer, 400, currentY + 45, { width: 140 });

      // 👇 MÁGICA AQUI: Transforma a área exata da imagem do QR Code num link clicável 👇
      doc.link(400, currentY + 45, 140, 140, publicUrl);

      // ID (Aproveitei para mudar o texto e avisar a pessoa que ela pode clicar)
      doc.font('Helvetica').fontSize(8).fillColor('#94a3b8').text(`ID: ${token.shortCode} | Escaneie ou Clique`, 400, currentY + 190, { align: 'center', width: 140 });
    }

    doc.end();
    return doc;
  }

  // ==========================================
  // GERAÇÃO DE PDF COMPLETO (HISTÓRICO)
  // ==========================================
  async generateHistoryPdf(editionId: string) {
    const historyRecord = await prisma.ecdEditionHistory.findFirst({
      where: { edition_id: editionId }
    });

    if (!historyRecord) {
      throw new Error("Nenhum registro de histórico encontrado para esta edição.");
    }

    const parseData = (data: any) => {
      if (!data) return [];
      return typeof data === 'string' ? JSON.parse(data) : data;
    };

    const encontristas: any[] = parseData(historyRecord.attendees_data);
    const areaLeaders: any[] = parseData(historyRecord.area_leaders_data);
    const workers: any[] = parseData(historyRecord.workers_data);
    const cotas: any[] = parseData(historyRecord.leaders_slots_data);

    encontristas.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
    areaLeaders.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    workers.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
    cotas.sort((a, b) => {
      const engA = (a.used_yellow || 0) + (a.used_green || 0);
      const engB = (b.used_yellow || 0) + (b.used_green || 0);
      return engB !== engA ? engB - engA : (a.name || '').localeCompare(b.name || '');
    });

    const doc = new PDFDocument({ size: 'A4', margin: 40 });

    // CABEÇALHO GERAL
    doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(18).text(`RELATÓRIO COMPLETO: ${historyRecord.edition_name.toUpperCase()}`, 40, doc.y, { align: 'center', width: 515 });
    doc.fontSize(10).font('Helvetica').fillColor('#64748b').text(`Data de Arquivamento: ${new Date(historyRecord.created_at).toLocaleString('pt-BR')}`, 40, doc.y, { align: 'center', width: 515 });
    doc.moveDown(1.5);

    const startY = doc.y;
    doc.rect(40, startY, 515, 40).fill('#f8fafc').stroke('#cbd5e1').lineWidth(0.5).stroke();
    doc.fillColor('#334155').font('Helvetica-Bold').fontSize(10)
      .text(`Total de Encontristas: ${encontristas.length}`, 60, startY + 15)
      .text(`Total da Equipe: ${(areaLeaders.length + workers.length)}`, 240, startY + 15)
      .text(`Líderes Engajados: ${cotas.length}`, 410, startY + 15);

    doc.y = startY + 60;

    const checkPageBreak = (neededHeight: number = 40) => {
      if (doc.y + neededHeight > 780) {
        doc.addPage();
        return true;
      }
      return false;
    };

    // ==========================================
    // SESSÃO 1: ENCONTRISTAS
    // ==========================================
    // 👇 CORRIGIDO AQUI (Adicionado 40, doc.y) 👇
    doc.fillColor('#1e3a8a').font('Helvetica-Bold').fontSize(12).text('1. LISTA DE ENCONTRISTAS', 40, doc.y);
    doc.moveDown(0.5);

    const drawEncontristasHeader = () => {
      const top = doc.y;
      doc.rect(40, top, 515, 20).fill('#334155');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8)
        .text('NOME COMPLETO', 45, top + 6, { width: 145 })
        .text('ORIGEM / CÉLULA', 195, top + 6, { width: 120 })
        .text('CONTATO', 320, top + 6, { width: 80 })
        .text('PERFIL', 405, top + 6, { width: 80 })
        .text('FICHA', 490, top + 6, { width: 60 });
      doc.y = top + 24;
    };

    if (encontristas.length === 0) {
      doc.font('Helvetica-Oblique').fontSize(9).fillColor('#94a3b8').text('Nenhum encontrista registrado.', 40, doc.y);
    } else {
      drawEncontristasHeader();
      encontristas.forEach((e) => {
        if (checkPageBreak(25)) drawEncontristasHeader();

        const rowY = doc.y;
        doc.fillColor('#334155').font('Helvetica').fontSize(8)
          .text(e.full_name || '-', 45, rowY, { width: 145, ellipsis: true })
          .text(e.origin || '-', 195, rowY, { width: 120, ellipsis: true })
          .text(e.phone || '-', 320, rowY, { width: 80 })
          .text(`${e.age || '-'}a | ${e.gender || '-'}`, 405, rowY, { width: 80 });

        const fichaType = (e.ficha_type || e.fichaType || '').toUpperCase();
        doc.fillColor(fichaType === 'AMARELA' ? '#a16207' : '#15803d').font('Helvetica-Bold')
          .text(fichaType || '-', 490, rowY, { width: 60 });

        doc.moveTo(40, rowY + 12).lineTo(555, rowY + 12).strokeColor('#f1f5f9').lineWidth(0.5).stroke();
        doc.y = rowY + 16;
      });
    }
    doc.moveDown(1.5);

    // ==========================================
    // SESSÃO 2: EQUIPE DE TRABALHO
    // ==========================================
    checkPageBreak(100);
    // 👇 CORRIGIDO AQUI (Adicionado 40, doc.y) 👇
    doc.fillColor('#1e3a8a').font('Helvetica-Bold').fontSize(12).text('2. EQUIPE DE TRABALHO', 40, doc.y);
    doc.moveDown(0.5);

    // 👇 CORRIGIDO AQUI (Adicionado 40, doc.y) 👇
    doc.fillColor('#475569').font('Helvetica-Bold').fontSize(9).text('COORDENADORES / LÍDERES DE ÁREA', 40, doc.y);
    doc.moveDown(0.3);
    if (areaLeaders.length === 0) {
      doc.font('Helvetica-Oblique').fontSize(8).fillColor('#94a3b8').text('Nenhum coordenador registrado.', 40, doc.y);
    } else {
      const cTop = doc.y;
      doc.rect(40, cTop, 515, 18).fill('#e2e8f0');
      doc.fillColor('#334155').font('Helvetica-Bold').fontSize(8)
        .text('NOME DO COORDENADOR', 45, cTop + 5, { width: 200 })
        .text('ÁREA DE ATUAÇÃO', 250, cTop + 5, { width: 150 })
        .text('VOLUNTÁRIOS SOB GESTÃO', 410, cTop + 5, { width: 140 });
      doc.y = cTop + 22;

      areaLeaders.forEach((l) => {
        if (checkPageBreak(20)) { /* header */ }
        const rowY = doc.y;
        doc.fillColor('#334155').font('Helvetica').fontSize(8)
          .text(l.name || '-', 45, rowY, { width: 200, ellipsis: true })
          .text(l.area_name || '-', 250, rowY, { width: 150, ellipsis: true })
          .text(`${l.workers_count || 0} voluntário(s)`, 410, rowY, { width: 140 });
        doc.y = rowY + 14;
      });
    }
    doc.moveDown(1);

    checkPageBreak(60);
    // 👇 CORRIGIDO AQUI (Adicionado 40, doc.y) 👇
    doc.fillColor('#475569').font('Helvetica-Bold').fontSize(9).text('VOLUNTÁRIOS DA EQUIPE', 40, doc.y);
    doc.moveDown(0.3);

    const drawWorkersHeader = () => {
      const wTop = doc.y;
      doc.rect(40, wTop, 515, 18).fill('#f1f5f9');
      doc.fillColor('#334155').font('Helvetica-Bold').fontSize(8)
        .text('NOME DO VOLUNTÁRIO', 45, wTop + 5, { width: 160 })
        .text('LÍDER DIRETO', 210, wTop + 5, { width: 130 })
        .text('CONTATO', 350, wTop + 5, { width: 90 })
        .text('ÁREA', 445, wTop + 5, { width: 100 });
      doc.y = wTop + 22;
    };

    if (workers.length === 0) {
      doc.font('Helvetica-Oblique').fontSize(8).fillColor('#94a3b8').text('Nenhum voluntário registrado.', 40, doc.y);
    } else {
      drawWorkersHeader();
      workers.forEach((w) => {
        if (checkPageBreak(20)) drawWorkersHeader();
        const rowY = doc.y;
        doc.fillColor('#334155').font('Helvetica').fontSize(8)
          .text(w.full_name || '-', 45, rowY, { width: 160, ellipsis: true })
          .text(w.leader_name || '-', 210, rowY, { width: 130, ellipsis: true })
          .text(w.phone || '-', 350, rowY, { width: 90 })
          .text(w.area_name || '-', 445, rowY, { width: 100, ellipsis: true });

        doc.moveTo(40, rowY + 12).lineTo(555, rowY + 12).strokeColor('#f8fafc').lineWidth(0.5).stroke();
        doc.y = rowY + 16;
      });
    }
    doc.moveDown(1.5);

    // ==========================================
    // SESSÃO 3: DESEMPENHO DE COTAS
    // ==========================================
    checkPageBreak(100);
    // 👇 CORRIGIDO AQUI (Adicionado 40, doc.y) 👇
    doc.fillColor('#1e3a8a').font('Helvetica-Bold').fontSize(12).text('3. DESEMPENHO E ENGAJAMENTO DE COTAS', 40, doc.y);
    doc.moveDown(0.5);

    const drawCotasHeader = () => {
      const top = doc.y;
      doc.rect(40, top, 515, 20).fill('#334155');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8)
        .text('LÍDER / ORIGEM', 45, top + 6, { width: 175 })
        .text('FORNECIDAS', 225, top + 6, { width: 70, align: 'center' })
        .text('AMARELAS USADAS', 300, top + 6, { width: 100, align: 'center' })
        .text('VERDES USADAS', 405, top + 6, { width: 85, align: 'center' })
        .text('APROV. (%)', 495, top + 6, { width: 55, align: 'center' });
      doc.y = top + 24;
    };

    if (cotas.length === 0) {
      doc.font('Helvetica-Oblique').fontSize(9).fillColor('#94a3b8').text('Nenhum dado de cota registrado.', 40, doc.y);
    } else {
      drawCotasHeader();
      cotas.forEach((c) => {
        if (checkPageBreak(25)) drawCotasHeader();

        const rowY = doc.y;
        const totalFornecido = (c.total_yellow || 0) + (c.total_green || 0);
        const totalUsado = (c.used_yellow || 0) + (c.used_green || 0);
        const aproveitamento = totalFornecido > 0 ? Math.round((totalUsado / totalFornecido) * 100) : 0;

        doc.fillColor('#334155').font('Helvetica-Bold').fontSize(8)
          .text(c.name || '-', 45, rowY, { width: 175, ellipsis: true });

        doc.font('Helvetica').fillColor('#64748b')
          .text(totalFornecido.toString(), 225, rowY, { width: 70, align: 'center' });

        doc.fillColor('#a16207').text(`${c.used_yellow || 0} / ${c.total_yellow || 0}`, 300, rowY, { width: 100, align: 'center' });
        doc.fillColor('#15803d').text(`${c.used_green || 0} / ${c.total_green || 0}`, 405, rowY, { width: 85, align: 'center' });

        doc.fillColor(aproveitamento === 100 ? '#10b981' : aproveitamento > 50 ? '#3b82f6' : '#f59e0b').font('Helvetica-Bold')
          .text(`${aproveitamento}%`, 495, rowY, { width: 55, align: 'center' });

        doc.moveTo(40, rowY + 12).lineTo(555, rowY + 12).strokeColor('#f1f5f9').lineWidth(0.5).stroke();
        doc.y = rowY + 16;
      });
    }

    doc.end();
    return doc;
  }
}