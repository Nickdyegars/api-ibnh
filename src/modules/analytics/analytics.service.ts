import { prisma } from '../../shared/database/prisma.js';

export class AnalyticsService {

    async registerAction(action: string, page?: string) {
        return await prisma.siteAnalytics.create({
            data: {
                action,
                page: page || 'Landing Page principal',
            },
        });
    }

    async getDashboardStats(period: string = 'mes') {
        const now = new Date();
        let startDate = new Date();

        // 1. Calcula a data de início baseada no filtro escolhido
        if (period === 'hoje') {
            startDate.setHours(0, 0, 0, 0); // Hoje a partir da meia-noite
        } else if (period === 'semana') {
            startDate.setDate(now.getDate() - 7); // Últimos 7 dias
        } else if (period === 'mes') {
            startDate.setDate(now.getDate() - 30); // Últimos 30 dias
        } else if (period === 'ano') {
            startDate.setFullYear(now.getFullYear() - 1); // Último 1 ano
        }

        // 2. Busca apenas os registros desse período no banco
        const records = await prisma.siteAnalytics.findMany({
            where: { createdAt: { gte: startDate } },
            orderBy: { createdAt: 'asc' } // Do mais antigo pro mais novo
        });

        let totalVisits = 0;
        let totalClicks = 0;

        // Usamos Map para somar os dados agrupados
        const visitsMap = new Map();
        const clicksMap = new Map();

        records.forEach(record => {
            const d = record.createdAt;
            let dateKey = '';

            // 3. Formata o Eixo X dependendo do filtro
            if (period === 'hoje') {
                dateKey = `${d.getHours()}h`; // Ex: 14h, 15h
            } else if (period === 'ano') {
                const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
                dateKey = monthNames[d.getMonth()]; // Ex: Jan, Fev
            } else {
                // Semana ou Mês (Ex: 05/03)
                const day = String(d.getDate()).padStart(2, '0');
                const month = String(d.getMonth() + 1).padStart(2, '0');
                dateKey = `${day}/${month}`;
            }

            // 4. Separa Visitas vs Cliques
            if (record.action === 'VISIT') {
                totalVisits++;
                visitsMap.set(dateKey, (visitsMap.get(dateKey) || 0) + 1);
            } else {
                totalClicks++;
                // Agrupa os cliques pelo nome do botão para o segundo gráfico
                let btnName = record.action;
                if (btnName === 'WHATSAPP_CLICK_JOSIMAR') btnName = 'Whats (Josimar)';
                if (btnName === 'WHATSAPP_CLICK_DIOGENES') btnName = 'Whats (Diogenes)';
                if (btnName === 'INSTAGRAM_CLICK') btnName = 'Instagram';
                if (btnName === 'YOUTUBE_CLICK') btnName = 'YouTube';

                clicksMap.set(btnName, (clicksMap.get(btnName) || 0) + 1);
            }
        });

        // 5. Converte no formato perfeito para o Recharts
        return {
            summary: { totalVisits, totalClicks },
            visitsChart: Array.from(visitsMap, ([name, quantidade]) => ({ name, quantidade })),
            clicksChart: Array.from(clicksMap, ([name, quantidade]) => ({ name, quantidade }))
        };
    }
}