import { prisma } from '../../shared/database/prisma.js';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import sharp from 'sharp';

export class EcdWorkersPdfService {

    // ==========================================
    // FICHA DE INSCRIÇÃO DA LIDERANÇA
    // ==========================================
    async generateWorkerLeaderPdf(leaderId: string) {
        const leader = await prisma.ecdWorkerLeader.findUnique({
            where: { id: leaderId },
            include: { area: true, edition: true }
        });

        if (!leader) throw new Error("Líder não encontrado.");

        const doc = new PDFDocument({ size: 'A4', margin: 30 });
        const rowHeight = 230;
        const startY = 40;
        const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5174';

        const publicUrl = `${baseUrl}/ecd/cadastro-trabalhador?token=${leader.id}`;
        const publicQrBuffer = await QRCode.toBuffer(publicUrl, { margin: 1, width: 110 });

        const getAreaColor = (areaName: string) => {
            const name = areaName.toUpperCase().trim();
            const colors: Record<string, string> = {
                'INTERCESSÃO': '#dc2626',
                'COZINHA': '#2563eb',
                'LOUVOR': '#854d0e',
                'CANTINA': '#eab308',
                'ORNAMENTAÇÃO': '#0ea5e9',
                'MULTIMÍDIA': '#991b1b',
                'CORREIOS': '#1e293b',
                'APOIO': '#9333ea',
            };
            return colors[name] || '#4f46e5';
        };

        const areaColor = getAreaColor(leader.area?.name || 'Geral');

        // Loop fixo: Sempre desenha 3 fichas para preencher exatamente 1 folha A4
        for (let index = 0; index < 3; index++) {
            const currentY = startY + (index * rowHeight);

            doc.rect(30, currentY, 535, 210).strokeColor('#cbd5e1').lineWidth(1).stroke();

            // Título sem numeração sequencial
            doc.rect(30, currentY, 535, 35).fill(areaColor);
            doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14)
                .text(`FICHA DE INSCRIÇÃO - EQUIPE DE TRABALHO`, 45, currentY + 12);

            doc.moveTo(380, currentY + 35).lineTo(380, currentY + 240).strokeColor('#e2e8f0').lineWidth(1).dash(5, { space: 5 }).stroke();
            doc.undash();

            doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text('DADOS DA LIDERANÇA', 45, currentY + 50);

            doc.fillColor('#475569').font('Helvetica').fontSize(10);
            doc.text(`Área: `, 45, currentY + 68, { continued: true }).font('Helvetica-Bold').text((leader.area?.name || 'Geral').toUpperCase());
            doc.font('Helvetica').text(`Líder Responsável: `, 45, currentY + 83, { continued: true }).font('Helvetica-Bold').text(leader.name);

            doc.moveTo(45, currentY + 105).lineTo(360, currentY + 105).strokeColor('#f1f5f9').lineWidth(1).stroke();

            doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10).text('COMO GARANTIR SUA VAGA NA EQUIPE:', 45, currentY + 115);
            doc.fillColor('#475569').font('Helvetica').fontSize(9)
                .text('1. Escaneie o QR Code ao lado com a câmera do seu celular.', 45, currentY + 130)
                .text('2. Preencha seus dados de saúde, logística e anexe sua foto de perfil.', 45, currentY + 145)
                .text('3. Após o envio, você entrará na fila de aprovação da sua liderança.', 45, currentY + 160);

            doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8).text('ENTREGUE PARA (NOME):', 395, currentY + 45);
            doc.moveTo(395, currentY + 65).lineTo(545, currentY + 65).strokeColor('#cbd5e1').lineWidth(1).stroke();

            doc.image(publicQrBuffer, 415, currentY + 80, { width: 110 });
            doc.link(415, currentY + 80, 110, 110, publicUrl);

            doc.font('Helvetica').fontSize(8).fillColor('#94a3b8')
                .text(`Token: ${leader.id.substring(0, 8).toUpperCase()}`, 395, currentY + 200, { align: 'center', width: 150 });
        }

        doc.end();
        return doc;
    }

    // ==========================================
    // RELATÓRIO DE TRABALHADORES (COM GRÁFICO E LISTA DINÂMICA)
    // ==========================================
    async generateTrabalhadoresPdf() {
        const currentEdition = await prisma.ecdEdition.findFirst({
            orderBy: { created_at: 'desc' }
        });

        if (!currentEdition) {
            throw new Error("Nenhuma edição ativa encontrada.");
        }

        let trabalhadores = await prisma.ecdWorkerRegistration.findMany({
            where: {
                edition_id: currentEdition.id,
                status: 'APROVADO'
            },
            include: {
                area: true,
                leader: true
            }
        });

        if (trabalhadores.length === 0) {
            throw new Error("Nenhum voluntário aprovado encontrado para esta edição.");
        }

        trabalhadores.sort((a, b) => {
            const nomeA = a.full_name || '';
            const nomeB = b.full_name || '';
            return nomeA.localeCompare(nomeB, 'pt-BR', { sensitivity: 'base' });
        });

        let totalHomens = 0;
        let totalMulheres = 0;
        trabalhadores.forEach(w => {
            if (w.gender === 'M') totalHomens++;
            else totalMulheres++;
        });
        const total = trabalhadores.length;
        const pctHomens = (totalHomens / total) * 100;
        const pctMulheres = (totalMulheres / total) * 100;

        const doc = new PDFDocument({ size: 'A4', margin: 40 });

        const drawDemographicsChart = () => {
            doc.moveDown(1);
            const startX = 40;
            let currentY = doc.y;

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
                .text(`RELAÇÃO DE TRABALHADORES APROVADOS - ${currentEdition.name.toUpperCase()}`, 40, 40, { align: 'center', width: 515 });
            doc.fontSize(10).font('Helvetica').fillColor('#64748b')
                .text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} | Equipe Total: ${total}`, 40, 60, { align: 'center', width: 515 });

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
                .text('FOTO', 45, top + 6, { width: 55, align: 'center' })
                .text('DADOS PESSOAIS', 110, top + 6, { width: 140 })
                .text('ÁREA / LÍDER', 260, top + 6, { width: 110 })
                .text('CONTATO', 380, top + 6, { width: 75 })
                .text('ALVO(S)', 465, top + 6, { width: 90 });
            doc.y = top + 24;
        };

        // Desenha a primeira página com o gráfico
        drawPageTitle(true);
        drawTableHeader();

        for (const worker of trabalhadores) {
            // ==========================================
            // CÁLCULO DE ALTURA DINÂMICA DA LINHA
            // ==========================================
            doc.font('Helvetica').fontSize(7);

            let rowHeight = 70;

            if (worker.bringing_target && worker.target_name) {
                const textHeight = doc.heightOfString(worker.target_name, { width: 90 });
                const neededHeight = 28 + textHeight + 10;
                if (neededHeight > rowHeight) {
                    rowHeight = neededHeight;
                }
            }

            if (doc.y + rowHeight > 780) {
                doc.addPage();
                drawPageTitle(false);
                drawTableHeader();
            }

            const rowY = doc.y;

            // ==========================================
            // TRATAMENTO DA IMAGEM COM SHARP
            // ==========================================
            let imgBuffer: Buffer | null = null;
            if (worker.profile_photo_url) {
                try {
                    const response = await fetch(worker.profile_photo_url);
                    if (response.ok) {
                        const arrayBuffer = await response.arrayBuffer();
                        imgBuffer = await sharp(Buffer.from(arrayBuffer))
                            .resize(100, 100, { fit: 'cover' })
                            .jpeg({ quality: 100 })
                            .toBuffer();
                    }
                } catch (err) {
                    console.warn(`[PDF] Erro ao carregar foto de ${worker.full_name}:`, err);
                }
            }

            // ==========================================
            // DESENHO DA LINHA
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

            // 2. Coluna: DADOS PESSOAIS
            doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(9)
                .text(worker.full_name || '-', 110, rowY + 15, { width: 140, ellipsis: true });
            doc.fillColor('#64748b').font('Helvetica').fontSize(8)
                .text(`${worker.age || '-'} anos  |  Sexo: ${worker.gender === 'M' ? 'Masc' : 'Fem'}`, 110, rowY + 28, { width: 140 });

            // 3. Coluna: ÁREA / LÍDER
            const areaName = worker.area?.name || 'GERAL';
            const leaderName = worker.leader?.name || 'Líder Não Informado';

            doc.fillColor('#dc2626').font('Helvetica-Bold').fontSize(8)
                .text(areaName.toUpperCase(), 260, rowY + 15, { width: 110, ellipsis: true });
            doc.fillColor('#334155').font('Helvetica').fontSize(8)
                .text(leaderName, 260, rowY + 28, { width: 110, ellipsis: true });

            // 4. Coluna: CONTATO
            doc.fillColor('#334155').font('Helvetica-Bold').fontSize(8)
                .text(worker.phone || '-', 380, rowY + 20, { width: 75 });

            // 5. Coluna: ALVO(S)
            if (worker.bringing_target && worker.target_name) {
                doc.fillColor('#16a34a').font('Helvetica-Bold').fontSize(8)
                    .text('Sim', 465, rowY + 15, { width: 90 });
                doc.fillColor('#475569').font('Helvetica').fontSize(7)
                    .text(worker.target_name, 465, rowY + 28, { width: 90 });
            } else {
                doc.fillColor('#94a3b8').font('Helvetica-Oblique').fontSize(8)
                    .text('Nenhum', 465, rowY + 20, { width: 90 });
            }

            // Linha divisória inferior adaptada para abraçar todo o texto
            doc.moveTo(40, rowY + rowHeight).lineTo(555, rowY + rowHeight).strokeColor('#e2e8f0').lineWidth(1).stroke();

            // Avança o Y pela altura dinâmica recalculada
            doc.y = rowY + rowHeight;
        }

        doc.end();
        return doc;
    }

    // ==========================================
    // RELATÓRIO DE TRABALHADORES PENDENTES (FILA DE ESPERA)
    // ==========================================
    async generateTrabalhadoresPendentesPdf(editionId?: string) {
        const currentEdition = editionId
            ? await prisma.ecdEdition.findUnique({ where: { id: editionId } })
            : await prisma.ecdEdition.findFirst({ orderBy: { created_at: 'desc' } });

        if (!currentEdition) {
            throw new Error("Nenhuma edição encontrada.");
        }

        let trabalhadoresPendentes = await prisma.ecdWorkerRegistration.findMany({
            where: {
                edition_id: currentEdition.id,
                status: 'PENDENTE'
            },
            include: {
                area: true,
                leader: true
            }
        });

        if (trabalhadoresPendentes.length === 0) {
            throw new Error("Nenhum voluntário na fila de espera encontrado.");
        }

        trabalhadoresPendentes.sort((a, b) => {
            const nomeA = a.full_name || '';
            const nomeB = b.full_name || '';
            return nomeA.localeCompare(nomeB, 'pt-BR', { sensitivity: 'base' });
        });

        let totalHomens = 0;
        let totalMulheres = 0;
        trabalhadoresPendentes.forEach(t => { if (t.gender === 'M') totalHomens++; else totalMulheres++; });
        const total = trabalhadoresPendentes.length;
        const pctHomens = (totalHomens / total) * 100;
        const pctMulheres = (totalMulheres / total) * 100;

        const doc = new PDFDocument({ size: 'A4', margin: 40 });

        const drawDemographicsChart = () => {
            doc.moveDown(1);
            const startX = 40;
            let currentY = doc.y;
            doc.fillColor('#334155').font('Helvetica-Bold').fontSize(9).text('Proporção de Gênero (Trabalhadores Pendentes):', startX, currentY);
            currentY += 15;
            const barWidth = 515;
            const barHeight = 12;
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
                .text(`TRABALHADORES NA FILA DE ESPERA - ${currentEdition.name.toUpperCase()}`, 40, 40, { align: 'center', width: 515 });
            doc.fontSize(10).font('Helvetica').fillColor('#64748b')
                .text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} | Total na fila: ${total}`, 40, 60, { align: 'center', width: 515 });

            if (isFirstPage) drawDemographicsChart(); else doc.moveDown(1.5);
        };

        const drawTableHeader = () => {
            const top = doc.y;
            doc.rect(40, top, 515, 20).fill('#475569');
            doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8)
                .text('FOTO', 45, top + 6, { width: 55, align: 'center' })
                .text('DADOS PESSOAIS', 110, top + 6, { width: 140 })
                .text('WHATSAPP', 260, top + 6, { width: 80 })
                .text('ÁREA / SETOR', 350, top + 6, { width: 110 })
                .text('PAGAMENTO', 470, top + 6, { width: 80 });
            doc.y = top + 24;
        };

        drawPageTitle(true);
        drawTableHeader();

        for (const t of trabalhadoresPendentes) {
            const rowHeight = 70;

            if (doc.y + rowHeight > 780) { doc.addPage(); drawPageTitle(false); drawTableHeader(); }
            const rowY = doc.y;

            let imgBuffer: Buffer | null = null;
            if (t.profile_photo_url) {
                try {
                    const response = await fetch(t.profile_photo_url);
                    if (response.ok) {
                        const arrayBuffer = await response.arrayBuffer();
                        imgBuffer = await sharp(Buffer.from(arrayBuffer))
                            .resize(100, 100, { fit: 'cover' })
                            .jpeg({ quality: 100 })
                            .toBuffer();
                    }
                } catch (err) {
                    console.warn(`[PDF] Erro ao carregar foto de ${t.full_name}:`, err);
                }
            }

            if (imgBuffer) {
                doc.image(imgBuffer, 45, rowY + 5, { width: 55, height: 55 });
                doc.rect(45, rowY + 5, 55, 55).lineWidth(1).strokeColor('#cbd5e1').stroke();
            } else {
                doc.rect(45, rowY + 5, 55, 55).lineWidth(1).dash(3, { space: 3 }).strokeColor('#cbd5e1').stroke();
                doc.undash();
                doc.fillColor('#94a3b8').fontSize(7).font('Helvetica-Oblique')
                    .text('SEM FOTO', 45, rowY + 28, { align: 'center', width: 55 });
            }

            doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(9)
                .text(t.full_name || '-', 110, rowY + 15, { width: 140, ellipsis: true });
            doc.fillColor('#64748b').font('Helvetica').fontSize(8)
                .text(`${t.age || '-'} anos  |  Sexo: ${t.gender === 'M' ? 'Masc' : 'Fem'}`, 110, rowY + 28, { width: 140 });

            doc.fillColor('#334155').font('Helvetica').fontSize(8)
                .text(t.phone || '-', 260, rowY + 20, { width: 80 });

            const areaName = t.area?.name || 'A definir';
            const leaderName = t.leader?.name || '';
            const setorText = leaderName ? `${areaName}\n(${leaderName})` : areaName;

            doc.fillColor('#334155').font('Helvetica').fontSize(8)
                .text(setorText, 350, rowY + 15, { width: 110, ellipsis: true });

            const pStatus = (t.payment_status || 'PENDENTE').toUpperCase();
            doc.fillColor(pStatus === 'PAGO' ? '#15803d' : '#b91c1c').font('Helvetica-Bold').fontSize(8)
                .text(pStatus, 470, rowY + 20, { width: 80 });

            doc.moveTo(40, rowY + rowHeight).lineTo(555, rowY + rowHeight).strokeColor('#e2e8f0').lineWidth(1).stroke();
            doc.y = rowY + rowHeight;
        }

        doc.end();
        return doc;
    }
}
