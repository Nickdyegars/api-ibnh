import { prisma } from '../../shared/database/prisma.js';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import sharp from 'sharp';

function formatEventPeriod(startDate?: Date | null, endDate?: Date | null): string {
  if (!startDate || !endDate) return "Data a definir";

  // Usamos UTC para evitar que o fuso horário atrase o dia impresso
  const s = new Date(startDate);
  const e = new Date(endDate);

  const formatDay = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', timeZone: 'UTC' });
  const formatMonth = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' });
  const formatYear = new Intl.DateTimeFormat('pt-BR', { year: 'numeric', timeZone: 'UTC' });

  const sDay = formatDay.format(s);
  const sMonth = formatMonth.format(s);
  const sYear = formatYear.format(s);

  const eDay = formatDay.format(e);
  const eMonth = formatMonth.format(e);
  const eYear = formatYear.format(e);

  // Se for no mesmo mês e ano (Ex: 21 a 23 de Novembro de 2026)
  if (sMonth === eMonth && sYear === eYear) {
    return `${sDay} a ${eDay} de ${sMonth} de ${sYear}`;
  }
  // Se for em meses diferentes (Ex: 31 de Outubro a 02 de Novembro de 2026)
  else if (sYear === eYear) {
    return `${sDay} de ${sMonth} a ${eDay} de ${eMonth} de ${sYear}`;
  }
  // Se cruzar o ano (Ex: 30 de Dezembro de 2026 a 01 de Janeiro de 2027)
  return `${sDay} de ${sMonth} de ${sYear} a ${eDay} de ${eMonth} de ${eYear}`;
}

export class EcdPdfService {

  // ==========================================
  // DESENHO DAS FICHAS DE ENCONTRISTAS (INGRESSOS)
  // ==========================================
  async generateTokensPdf(tokens: any[], edition: any, isReprint: boolean = false) {
    const eventDate = formatEventPeriod(edition.startDate, edition.endDate);
    const totalStr = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(edition.priceTotal || 100);
    const signalStr = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(edition.priceSignal || 50);

    const doc = new PDFDocument({ size: 'A4', margin: 30 });
    const rowHeight = 230;
    const startY = 40;
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5174';

    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index];
      if (!token) continue;

      if (index > 0 && index % 3 === 0) doc.addPage();

      const currentY = startY + (index % 3) * rowHeight;
      const colorHex = token.tokenType === 'AMARELA' ? '#eab308' : '#16a34a';
      const seqNumber = token.tokenNumber;

      // Borda Externa do Ingresso
      doc.rect(30, currentY, 535, 210).strokeColor('#cbd5e1').lineWidth(1).stroke();

      // Faixa Superior Colorida com o NÚMERO SEQUENCIAL
      doc.rect(30, currentY, 535, 35).fill(colorHex);
      const titleSuffix = isReprint ? ' (REIMPRESSÃO)' : '';
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14).text(`ENCONTRO COM DEUS - FICHA ${token.tokenType} Nº ${seqNumber}${titleSuffix}`, 45, currentY + 12);

      // DIVISÓRIA VERTICAL DO TICKET (Estilo Canhoto)
      doc.moveTo(380, currentY + 35).lineTo(380, currentY + 240).strokeColor('#e2e8f0').lineWidth(1).dash(5, { space: 5 }).stroke();
      doc.undash();

      // ==========================================
      // LADO ESQUERDO: INFORMAÇÕES E INSTRUÇÕES
      // ==========================================
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text('INFORMAÇÕES DO EVENTO', 45, currentY + 50);

      doc.fillColor('#475569').font('Helvetica').fontSize(10);
      doc.text(`Data: `, 45, currentY + 68, { continued: true }).font('Helvetica-Bold').text(eventDate);
      doc.font('Helvetica').text(`Valor: `, 45, currentY + 83, { continued: true }).font('Helvetica-Bold').text(`${totalStr} (Sinal mínimo para reserva: ${signalStr})`);

      // Linha divisória fina
      doc.moveTo(45, currentY + 105).lineTo(360, currentY + 105).strokeColor('#f1f5f9').lineWidth(1).stroke();

      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10).text('COMO GARANTIR SUA VAGA:', 45, currentY + 115);
      doc.fillColor('#475569').font('Helvetica').fontSize(9)
        .text('1. Escaneie o QR Code ao lado com a câmera do celular.', 45, currentY + 130)
        .text('2. Preencha o formulário e anexe o comprovante do pagamento PIX.', 45, currentY + 145)
        .text('3. Digite o código do seu líder (PIN) na primeira etapa da tela.', 45, currentY + 160);

      // ==========================================
      // LADO DIREITO: QR CODE E PIN
      // ==========================================
      doc.rect(395, currentY + 45, 150, 35).fillAndStroke('#f8fafc', '#94a3b8');
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8).text('CÓDIGO DO LÍDER (PIN):', 400, currentY + 52, { width: 140, align: 'center' });
      doc.fillColor('#cbd5e1').font('Helvetica-Bold').fontSize(12).text('', 400, currentY + 64, { width: 140, align: 'center' });

      // QR Code Único
      const publicUrl = `${baseUrl}/ecd/cadastro?token=${token.id}`;
      const publicQrBuffer = await QRCode.toBuffer(publicUrl, { margin: 1, width: 110 });
      doc.image(publicQrBuffer, 415, currentY + 90, { width: 110 });
      doc.link(415, currentY + 90, 110, 110, publicUrl);

      // ID de Segurança
      const idText = isReprint ? `ID: ${token.shortCode} | Escaneie ou Clique` : `ID: ${token.shortCode} | Link de uso único`;
      doc.font('Helvetica').fontSize(8).fillColor('#94a3b8').text(idText, 395, currentY + 210, { align: 'center', width: 150 });
    }

    doc.end();
    return doc;
  }

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

  async generateEncontristasPdf() {
    // 1. Busca a edição atual
    const currentEdition = await prisma.ecdEdition.findFirst({
      orderBy: { created_at: 'desc' }
    });

    if (!currentEdition) {
      throw new Error("Nenhuma edição ativa encontrada.");
    }

    // 2. Busca APENAS os encontristas APROVADOS (Ativos ou Concluídos)
    let encontristas = await prisma.ecdRegistration.findMany({
      where: {
        edition_id: currentEdition.id,
        status: { in: ['ATIVO', 'CONCLUIDO'] }
      },
      include: {
        leader: { include: { cell: true } }
      }
    });

    if (encontristas.length === 0) {
      throw new Error("Nenhum encontrista aprovado encontrado para esta edição.");
    }

    // 3. ORDENAÇÃO ALFABÉTICA ABSOLUTA (Ignora Maiúsculas/Minúsculas e Acentos)
    encontristas.sort((a, b) => {
      const nomeA = a.full_name || '';
      const nomeB = b.full_name || '';
      return nomeA.localeCompare(nomeB, 'pt-BR', { sensitivity: 'base' });
    });

    // ==========================================
    // CÁLCULO DE DEMOGRAFIA PARA O GRÁFICO
    // ==========================================
    let totalHomens = 0;
    let totalMulheres = 0;
    encontristas.forEach(e => {
      if (e.gender === 'M') totalHomens++;
      else totalMulheres++; // Assume 'F' para o restante
    });
    const total = encontristas.length;
    const pctHomens = (totalHomens / total) * 100;
    const pctMulheres = (totalMulheres / total) * 100;

    // 4. Prepara o Documento PDF
    const doc = new PDFDocument({ size: 'A4', margin: 40 });

    // Gráfico de Barras Horizontal
    const drawDemographicsChart = () => {
      doc.moveDown(1);
      const startX = 40;
      let currentY = doc.y;

      doc.fillColor('#334155').font('Helvetica-Bold').fontSize(9)
        .text('Proporção de Gênero dos Encontristas:', startX, currentY);

      currentY += 15;
      const barWidth = 515;
      const barHeight = 12;
      const widthHomens = (totalHomens / total) * barWidth || 0;
      const widthMulheres = (totalMulheres / total) * barWidth || 0;

      // Barra Masculina (Azul)
      if (widthHomens > 0) doc.rect(startX, currentY, widthHomens, barHeight).fill('#3b82f6');
      // Barra Feminina (Rosa)
      if (widthMulheres > 0) doc.rect(startX + widthHomens, currentY, widthMulheres, barHeight).fill('#ec4899');

      currentY += 16;

      // Labels de Porcentagem
      doc.fillColor('#3b82f6').font('Helvetica-Bold').fontSize(8)
        .text(`Masculino: ${totalHomens} (${pctHomens.toFixed(1)}%)`, startX, currentY);

      doc.fillColor('#ec4899')
        .text(`Feminino: ${totalMulheres} (${pctMulheres.toFixed(1)}%)`, startX + widthHomens - 120, currentY, { align: 'right', width: 120 });

      doc.moveDown(2);
    };

    // Cabeçalho da Página (Título)
    const drawPageTitle = (isFirstPage = false) => {
      doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(16)
        .text(`RELAÇÃO DE ENCONTRISTAS APROVADOS - ${currentEdition.name.toUpperCase()}`, 40, 40, { align: 'center', width: 515 });
      doc.fontSize(10).font('Helvetica').fillColor('#64748b')
        .text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} | Total: ${total}`, 40, 60, { align: 'center', width: 515 });

      if (isFirstPage) {
        drawDemographicsChart();
      } else {
        doc.moveDown(1.5);
      }
    };

    // Cabeçalho da Tabela
    const drawTableHeader = () => {
      const top = doc.y;
      doc.rect(40, top, 515, 20).fill('#334155');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8)
        .text('FOTO', 55, top + 6, { width: 50 })
        .text('DADOS PESSOAIS', 120, top + 6, { width: 160 })
        .text('ORIGEM / LÍDER', 290, top + 6, { width: 120 })
        .text('CONTATO', 420, top + 6, { width: 80 })
        .text('FICHA', 510, top + 6, { width: 45 });
      doc.y = top + 24;
    };

    // Desenha a primeira página com o gráfico
    drawPageTitle(true);
    drawTableHeader();

    const rowHeight = 70; // Altura de cada linha para caber a foto

    for (const e of encontristas) {

      // Quebra de página se não houver espaço para a próxima linha
      if (doc.y + rowHeight > 780) {
        doc.addPage();
        drawPageTitle(false);
        drawTableHeader();
      }

      const rowY = doc.y;

      // ==========================================
      // TRATAMENTO DA IMAGEM COM SHARP (BLINDADO)
      // ==========================================
      let imgBuffer: Buffer | null = null;
      if (e.profile_photo_url) {
        try {
          const response = await fetch(e.profile_photo_url);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            imgBuffer = await sharp(Buffer.from(arrayBuffer))
              .resize(100, 100, { fit: 'cover' })
              .jpeg({ quality: 100 })
              .toBuffer();
          }
        } catch (err) {
          console.warn(`[PDF] Erro ao carregar/converter foto de ${e.full_name}:`, err);
        }
      }

      // ==========================================
      // DESENHO DA LINHA DA TABELA
      // ==========================================

      // 1. Coluna: FOTO
      if (imgBuffer) {
        doc.image(imgBuffer, 45, rowY + 5, { width: 55, height: 55 });
        doc.rect(45, rowY + 5, 55, 55).lineWidth(1).strokeColor('#cbd5e1').stroke();
      } else {
        doc.rect(45, rowY + 5, 55, 55).lineWidth(1).dash(3, { space: 3 }).strokeColor('#cbd5e1').stroke();
        doc.undash();
        doc.fillColor('#94a3b8').fontSize(7).font('Helvetica-Oblique')
          .text('SEM FOTO', 45, rowY + 28, { align: 'center', width: 55 });
      }

      // 👇 2. Coluna: DADOS PESSOAIS (Agora com empilhamento dinâmico) 👇
      let textPosY = rowY + 8; // Subimos ligeiramente o início para caber as 3 possíveis informações

      doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(9);

      // Limita a altura a 24px (aprox 2 linhas). Se estourar, aplica reticências automáticas
      doc.text(e.full_name || '-', 120, textPosY, { width: 160, height: 24, ellipsis: true });

      // O PDFKit guarda a posição final da linha na variável doc.y.
      // Assim, se o nome ocupou 1 linha ou 2 linhas, nós continuamos exatamente daqui!
      textPosY = doc.y + 1;

      if (e.nickname) {
        doc.fillColor('#0284c7').font('Helvetica-Oblique').fontSize(8)
          .text(`"${e.nickname}"`, 120, textPosY, { width: 160, lineBreak: false, ellipsis: true });

        textPosY = doc.y + 2;
      } else {
        textPosY += 2; // Respiro extra caso não tenha apelido
      }

      doc.fillColor('#64748b').font('Helvetica').fontSize(8)
        .text(`${e.age || '-'} anos  |  Sexo: ${e.gender || '-'}`, 120, textPosY, { width: 160 });

      // 3. Coluna: ORIGEM / LÍDER
      const leaderName = e.leader?.cell?.leader || e.leader?.name || e.cell_leader_name || 'Desconhecido';
      doc.fillColor('#334155').font('Helvetica').fontSize(8)
        .text(leaderName, 290, rowY + 20, { width: 120, ellipsis: true });

      // 4. Coluna: CONTATO
      doc.fillColor('#334155').font('Helvetica').fontSize(8)
        .text(e.phone || '-', 420, rowY + 20, { width: 80 });

      // 5. Coluna: FICHA (Cor de Fundo)
      const fichaType = (e.ficha_type || 'N/A').toUpperCase();
      const colorHex = fichaType === 'AMARELA' ? '#eab308' : '#16a34a';

      doc.rect(510, rowY + 18, 45, 14).fill(colorHex);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7)
        .text(fichaType, 510, rowY + 22, { align: 'center', width: 45 });

      // Linha divisória no final da row
      doc.moveTo(40, rowY + rowHeight).lineTo(555, rowY + rowHeight).strokeColor('#e2e8f0').lineWidth(1).stroke();

      // Avança o Y para a próxima iteração com a altura fixa de 70
      doc.y = rowY + rowHeight;
    }

    doc.end();
    return doc;
  }

  async generatePendentesPdf(editionId?: string) {
    const currentEdition = editionId
      ? await prisma.ecdEdition.findUnique({ where: { id: editionId } })
      : await prisma.ecdEdition.findFirst({ orderBy: { created_at: 'desc' } });

    if (!currentEdition) throw new Error("Nenhuma edição encontrada.");

    // Busca APENAS os PENDENTES
    let pendentes = await prisma.ecdRegistration.findMany({
      where: {
        edition_id: currentEdition.id,
        status: 'PENDENTE'
      },
      include: { leader: { include: { cell: true } } }
    });

    if (pendentes.length === 0) {
      throw new Error("A Fila de Espera está vazia para esta edição.");
    }

    // Ordenação Alfabética
    pendentes.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'pt-BR', { sensitivity: 'base' }));

    // Cálculos para o gráfico
    let totalHomens = 0;
    let totalMulheres = 0;
    pendentes.forEach(e => { if (e.gender === 'M') totalHomens++; else totalMulheres++; });
    const total = pendentes.length;
    const pctHomens = (totalHomens / total) * 100;
    const pctMulheres = (totalMulheres / total) * 100;

    const doc = new PDFDocument({ size: 'A4', margin: 40 });

    const drawDemographicsChart = () => {
      doc.moveDown(1);
      const startX = 40; let currentY = doc.y;
      doc.fillColor('#334155').font('Helvetica-Bold').fontSize(9).text('Proporção de Gênero (Fila de Espera):', startX, currentY);
      currentY += 15;
      const barWidth = 515; const barHeight = 12;
      const widthHomens = (totalHomens / total) * barWidth || 0;
      const widthMulheres = (totalMulheres / total) * barWidth || 0;

      if (widthHomens > 0) doc.rect(startX, currentY, widthHomens, barHeight).fill('#3b82f6');
      if (widthMulheres > 0) doc.rect(startX + widthHomens, currentY, widthMulheres, barHeight).fill('#ec4899');
      currentY += 16;
      doc.fillColor('#3b82f6').font('Helvetica-Bold').fontSize(8).text(`Masculino: ${totalHomens} (${pctHomens.toFixed(1)}%)`, startX, currentY);
      doc.fillColor('#ec4899').text(`Feminino: ${totalMulheres} (${pctMulheres.toFixed(1)}%)`, startX + widthHomens - 120, currentY, { align: 'right', width: 120 });
      doc.moveDown(2);
    };

    const drawPageTitle = (isFirstPage = false) => {
      doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(16)
        .text(`FILA DE ESPERA (PENDENTES) - ${currentEdition.name.toUpperCase()}`, 40, 40, { align: 'center', width: 515 });
      doc.fontSize(10).font('Helvetica').fillColor('#64748b')
        .text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} | Total na fila: ${total}`, 40, 60, { align: 'center', width: 515 });

      if (isFirstPage) drawDemographicsChart(); else doc.moveDown(1.5);
    };

    const drawTableHeader = () => {
      const top = doc.y;
      doc.rect(40, top, 515, 20).fill('#334155');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8)
        .text('FOTO', 55, top + 6, { width: 50 })
        .text('DADOS PESSOAIS', 120, top + 6, { width: 160 })
        .text('ORIGEM / LÍDER', 290, top + 6, { width: 120 })
        .text('CONTATO', 420, top + 6, { width: 80 })
        .text('FICHA', 510, top + 6, { width: 45 });
      doc.y = top + 24;
    };

    drawPageTitle(true);
    drawTableHeader();
    const rowHeight = 70;

    for (const e of pendentes) {
      if (doc.y + rowHeight > 780) { doc.addPage(); drawPageTitle(false); drawTableHeader(); }
      const rowY = doc.y;

      let imgBuffer: Buffer | null = null;
      if (e.profile_photo_url) {
        try {
          const response = await fetch(e.profile_photo_url);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            imgBuffer = await sharp(Buffer.from(arrayBuffer)).resize(100, 100, { fit: 'cover' }).jpeg({ quality: 100 }).toBuffer();
          }
        } catch (err) { }
      }

      if (imgBuffer) {
        doc.image(imgBuffer, 45, rowY + 5, { width: 55, height: 55 });
        doc.rect(45, rowY + 5, 55, 55).lineWidth(1).strokeColor('#cbd5e1').stroke();
      } else {
        doc.rect(45, rowY + 5, 55, 55).lineWidth(1).dash(3, { space: 3 }).strokeColor('#cbd5e1').stroke(); doc.undash();
        doc.fillColor('#94a3b8').fontSize(7).font('Helvetica-Oblique').text('SEM FOTO', 45, rowY + 28, { align: 'center', width: 55 });
      }

      doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(9).text(e.full_name || '-', 120, rowY + 15, { width: 160, ellipsis: true });
      doc.fillColor('#64748b').font('Helvetica').fontSize(8).text(`${e.age || '-'} anos  |  Sexo: ${e.gender || '-'}`, 120, rowY + 28, { width: 160 });

      const leaderName = e.leader?.cell?.leader || e.leader?.name || e.cell_leader_name || 'Desconhecido';
      doc.fillColor('#334155').font('Helvetica').fontSize(8).text(leaderName, 290, rowY + 20, { width: 120, ellipsis: true });
      doc.fillColor('#334155').font('Helvetica').fontSize(8).text(e.phone || '-', 420, rowY + 20, { width: 80 });

      const fichaType = (e.ficha_type || 'N/A').toUpperCase();
      const colorHex = fichaType === 'AMARELA' ? '#eab308' : '#16a34a';

      doc.rect(510, rowY + 18, 45, 14).fill(colorHex);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7).text(fichaType, 510, rowY + 22, { align: 'center', width: 45 });
      doc.moveTo(40, rowY + rowHeight).lineTo(555, rowY + rowHeight).strokeColor('#e2e8f0').lineWidth(1).stroke();
      doc.y = rowY + rowHeight;
    }

    doc.end();
    return doc;
  }

  async generateEncontristasListagemPdf() {
    const currentEdition = await prisma.ecdEdition.findFirst({
      orderBy: { created_at: 'desc' }
    });

    if (!currentEdition) throw new Error("Nenhuma edição ativa encontrada.");

    let encontristas = await prisma.ecdRegistration.findMany({
      where: {
        edition_id: currentEdition.id,
        status: { in: ['ATIVO', 'CONCLUIDO'] }
      },
      select: {
        full_name: true,
        nickname: true,
        gender: true
      }
    });

    if (encontristas.length === 0) throw new Error("Nenhum encontrista aprovado encontrado.");

    // Separa por sexo e ordena alfabeticamente
    const homens = encontristas.filter(e => e.gender === 'M').sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'pt-BR'));
    const mulheres = encontristas.filter(e => e.gender !== 'M').sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'pt-BR'));

    const doc = new PDFDocument({ size: 'A4', margin: 40 });

    const drawPageHeader = (title: string, color: string, totalCount: number) => {
      doc.fillColor(color).font('Helvetica-Bold').fontSize(16)
        .text(`LISTA DE CHAMADA - ${title} (${totalCount})`, 40, 40, { align: 'center', width: 515 });
      doc.fontSize(10).font('Helvetica').fillColor('#64748b')
        .text(`Edição: ${currentEdition.name} | Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 40, 60, { align: 'center', width: 515 });
      doc.moveDown(2);
    };

    const drawGroup = (groupTitle: string, groupData: any[], headerColor: string) => {
      if (groupData.length === 0) return;

      drawPageHeader(groupTitle, headerColor, groupData.length);

      let currentY = doc.y;
      const rowHeight = 26;

      let index = 1;
      for (const e of groupData) {
        if (currentY + rowHeight > 780) {
          doc.addPage();
          drawPageHeader(groupTitle, headerColor, groupData.length);
          currentY = doc.y;
        }

        // Número sequencial discreto
        doc.fillColor('#94a3b8').font('Helvetica').fontSize(9)
          .text(`${index++}.`, 40, currentY + 6, { width: 30, align: 'right' });

        // Posiciona no X do nome e usa 'continued: true' para empilhar o apelido perfeitamente ao lado
        doc.x = 80;
        doc.y = currentY + 6;

        if (e.nickname) {
          doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(10)
            .text(`${e.full_name || '-'} `, { continued: true });

          doc.fillColor(headerColor).font('Helvetica-Oblique').fontSize(9)
            .text(`("${e.nickname}")`, { continued: false });
        } else {
          doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(10)
            .text(e.full_name || '-', { continued: false });
        }

        // Linha divisória bem leve logo abaixo
        doc.moveTo(80, currentY + 21).lineTo(535, currentY + 21).strokeColor('#f1f5f9').lineWidth(0.5).stroke();
        currentY += rowHeight;
      }
    };

    // Desenha o grupo de Homens (Azul)
    drawGroup('HOMENS', homens, '#0284c7');

    // Quebra de página antes das mulheres
    if (homens.length > 0 && mulheres.length > 0) doc.addPage();

    // Desenha o grupo de Mulheres (Rosa/Magenta)
    drawGroup('MULHERES', mulheres, '#db2777');

    doc.end();
    return doc;
  }

  // ==========================================
  // RELATÓRIO COMPLETO DE ENCERRAMENTO DA EDIÇÃO
  // ==========================================
  async generateEditionReportPdf(editionId: string) {
    const edition = await prisma.ecdEdition.findUnique({
      where: { id: editionId }
    });

    if (!edition) {
      throw new Error("Edição não encontrada.");
    }

    const workers = await prisma.ecdWorkerRegistration.findMany({
      where: { edition_id: editionId, status: 'APROVADO' },
      select: {
        full_name: true,
        gender: true,
        age: true,
        phone: true,
        area: { select: { name: true } },
        leader: { select: { name: true } }
      },
      orderBy: { area: { name: 'asc' } }
    });

    const attendees = await prisma.ecdRegistration.findMany({
      where: { edition_id: editionId, status: 'ATIVO' },
      select: {
        full_name: true,
        gender: true,
        age: true,
        phone: true,
        in_cell: true,
        cell_leader_name: true,
        invited_by: true,
        leader: { select: { name: true } }
      },
      orderBy: { full_name: 'asc' }
    });

    const doc = new PDFDocument({
      size: 'A4',
      bufferPages: true,
      margins: { top: 40, left: 40, right: 40, bottom: 10 }
    });

    // HELPER DE TABELA
    const drawTableRow = (c1: string, c2: string, c3: string, c4: string, isHeader = false) => {
      if (doc.y > 750) {
        doc.addPage();
        doc.y = 40;
      }

      const y = doc.y;
      doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(isHeader ? 10 : 9);
      doc.fillColor(isHeader ? '#1e3a8a' : '#334155');

      doc.text(c1, 40, y, { width: 175, height: 15, lineBreak: false, ellipsis: true });
      doc.text(c2, 220, y, { width: 75, height: 15, lineBreak: false, ellipsis: true });
      doc.text(c3, 300, y, { width: 85, height: 15, lineBreak: false, ellipsis: true });
      doc.text(c4, 390, y, { width: 165, height: 15, lineBreak: false, ellipsis: true });

      doc.moveTo(40, y + 14).lineTo(555, y + 14).strokeColor(isHeader ? '#cbd5e1' : '#f1f5f9').lineWidth(1).stroke();
      doc.y = y + 20;
    };

    // LAYOUT CABEÇALHO
    doc.rect(0, 0, doc.page.width, 15).fill('#1e3a8a');
    doc.moveDown(1.5);

    doc.fillColor('#1e293b').fontSize(22).font('Helvetica-Bold')
      .text('RELATÓRIO DE ENCERRAMENTO', { align: 'center', characterSpacing: 1 });

    doc.fontSize(14).font('Helvetica').fillColor('#475569')
      .text(edition.name.toUpperCase(), { align: 'center' });

    doc.moveDown(1);
    doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).strokeColor('#e2e8f0').lineWidth(1).stroke();
    doc.moveDown(1.5);

    // CARD RESUMO
    const startY = doc.y;
    doc.rect(40, startY, doc.page.width - 80, 55).fill('#f8fafc');
    doc.rect(40, startY, doc.page.width - 80, 55).strokeColor('#cbd5e1').stroke();

    doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(11).text('RESUMO DO EVENTO', 55, startY + 10);
    doc.font('Helvetica').fontSize(10).fillColor('#475569');
    doc.text(`Total de Voluntários / Equipe: `, 55, startY + 28);
    doc.font('Helvetica-Bold').text(`${workers.length}`, 210, startY + 28);

    doc.font('Helvetica').text(`Total de Encontristas: `, 300, startY + 28);
    doc.font('Helvetica-Bold').text(`${attendees.length}`, 410, startY + 28);

    doc.x = 40;
    doc.y = startY + 75;

    // SEÇÃO TRABALHADORES
    doc.fillColor('#1e3a8a').font('Helvetica-Bold').fontSize(14).text('EQUIPE E TRABALHADORES ALOCADOS');
    doc.moveDown(0.8);

    if (workers.length === 0) {
      doc.font('Helvetica-Oblique').fontSize(10).fillColor('#94a3b8').text('Nenhum trabalhador aprovado nesta edição.');
      doc.moveDown(2);
    } else {
      let currentArea = '';
      workers.forEach((worker) => {
        const areaName = worker.area?.name || 'Sem Área';
        if (areaName !== currentArea) {
          doc.moveDown(0.5);
          doc.fillColor('#2563eb').font('Helvetica-Bold').fontSize(11).text(`■ ÁREA: ${areaName.toUpperCase()}`);
          doc.moveDown(0.3);
          drawTableRow('Nome do Voluntário', 'Perfil', 'Contato', 'Líder Direto', true);
          currentArea = areaName;
        }
        const leaderName = worker.leader?.name || '-';
        const phone = worker.phone || '-';
        const profile = `${worker.age} anos | ${worker.gender === 'M' ? 'Masc' : 'Fem'}`;
        drawTableRow(`• ${worker.full_name}`, profile, phone, leaderName);
      });
    }

    doc.moveDown(2);

    // RESET DO CURSOR
    doc.x = 40;
    doc.fillColor('#1e3a8a').font('Helvetica-Bold').fontSize(14).text('LISTA FINAL DE ENCONTRISTAS', { width: 515 });
    doc.moveDown(0.8);

    if (attendees.length === 0) {
      doc.font('Helvetica-Oblique').fontSize(10).fillColor('#94a3b8').text('Nenhum encontrista encontrado ou ativo nesta edição.');
    } else {
      drawTableRow('Nome do Encontrista', 'Perfil', 'Contato', 'Origem (Célula / Convite)', true);

      attendees.forEach((attendee, index) => {
        const phone = attendee.phone || '-';
        const profile = `${attendee.age} anos | ${attendee.gender === 'M' ? 'Masc' : 'Fem'}`;

        let origin = '-';
        if (attendee.cell_leader_name && attendee.cell_leader_name !== 'Origem Desconhecida') {
          origin = `Célula: ${attendee.cell_leader_name}`;
        } else if (attendee.leader?.name) {
          origin = `Líder: ${attendee.leader.name}`;
        } else if (attendee.invited_by) {
          origin = `Convite: ${attendee.invited_by}`;
        }

        drawTableRow(`${index + 1}. ${attendee.full_name}`, profile, phone, origin);
      });
    }

    // RODAPÉ
    const totalPages = doc.bufferedPageRange().count;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).fillColor('#94a3b8').text(
        `Gerado em ${new Date().toLocaleDateString('pt-BR')} | IBNH Painel - Página ${i + 1} de ${totalPages}`,
        40,
        doc.page.height - 30,
        { align: 'center' }
      );
    }

    doc.flushPages();
    doc.end();
    return { doc, editionName: edition.name };
  }
}
