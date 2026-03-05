// src/modules/rosters/roster.service.ts
import { prisma } from '../../shared/database/prisma.js';
import { CreateRosterBodyType } from './roster.schemas.js';

export class RosterService {

    async createRoster(data: CreateRosterBodyType) {
        // 1. Acha o Ministério
        const ministry = await prisma.ministry.findUnique({
            where: { name: data.ministry }
        });

        if (!ministry) throw new Error(`Ministério '${data.ministry}' não encontrado no banco.`);

        // 2. Busca todos os membros desse ministério para pegarmos os IDs
        const membersList = await prisma.member.findMany({
            where: { ministry_id: ministry.id }
        });
        const memberMap = new Map(membersList.map(m => [m.name, m.id]));

        // 3. Cria a Escala Principal (Schedule)
        const schedule = await prisma.schedule.create({
            data: {
                month_reference: data.month,
                ministry_id: ministry.id,
                // Ignoramos o authorId do Firebase por enquanto para não dar erro de UUID
            }
        });

        // 4. Cria os Turnos (Shifts) e as Associações (ShiftAssignments)
        for (const shift of data.shifts) {
            // Converte "01/02/2026" para Date
            const [day, month, year] = shift.date.split('/');
            const shiftDate = new Date(`${year}-${month}-${day}T12:00:00Z`);

            const createdShift = await prisma.shift.create({
                data: {
                    schedule_id: schedule.id,
                    shift_date: shiftDate,
                    day_name: shift.dayName
                }
            });

            // Vincula a equipe
            for (const memberName of shift.team) {
                const memberId = memberMap.get(memberName);
                if (memberId) {
                    await prisma.shiftAssignment.create({
                        data: {
                            shift_id: createdShift.id,
                            member_id: memberId
                        }
                    });
                }
            }
        }

        return schedule;
    }

    async getAllRosters(ministryFilter: string) {
        // 1. Busca as escalas no Prisma com todas as relações
        const schedules = await prisma.schedule.findMany({

            // CORREÇÃO: Usamos {} em vez de undefined quando for 'all'
            where: ministryFilter !== 'all'
                ? { ministry: { name: ministryFilter } }
                : {},

            include: {
                ministry: true,
                author: { include: { profile: true } },
                shifts: {
                    orderBy: { shift_date: 'asc' }, // Ordena por data do culto
                    include: {
                        members: {
                            include: { member: true } // Puxa o nome da pessoa escalada
                        }
                    }
                }
            },
            orderBy: { created_at: 'desc' } // Escalas mais novas primeiro
        });

        // 2. Formata para o formato exato que o seu Frontend (React) espera
        return schedules.map(schedule => ({
            id: schedule.id,
            ministry: schedule.ministry?.name || 'Geral',
            month: schedule.month_reference,
            createdBy: schedule.author?.profile?.full_name || schedule.author?.email || 'Sistema',
            createdAt: schedule.created_at,
            shifts: schedule.shifts.map(shift => ({
                id: shift.id,
                date: new Date(shift.shift_date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }),
                dayName: shift.day_name,
                team: shift.members.map(assignment => assignment.member.name)
            }))
        }));
    }

    async deleteRoster(id: string) {
        await prisma.schedule.delete({
            where: { id }
        });
        return { success: true };
    }

    async generateRosterPreview(data: any) {
        const { month, ministry: ministryName, teamSize, restrictions } = data;

        // 1. Busca o Ministério e os Membros no Postgres
        const ministry = await prisma.ministry.findUnique({ where: { name: ministryName } });
        if (!ministry) throw new Error("Ministério não encontrado");

        const members = await prisma.member.findMany({
            where: { ministry_id: ministry.id },
            select: { name: true }
        });

        if (members.length === 0) throw new Error("Nenhum membro cadastrado neste ministério");

        // 2. Lógica de Datas (Quintas e Domingos)
        const [year, monthNum] = month.split('-').map(Number);
        const date = new Date(year, monthNum - 1, 1);
        const services: any[] = [];

        while (date.getMonth() === monthNum - 1) {
            const dayOfWeek = date.getDay();
            if (dayOfWeek === 0 || dayOfWeek === 4) {
                const rawDate = date.toISOString().split('T')[0];
                // Helper para pegar o domingo daquela semana
                const tempDate = new Date(rawDate + 'T12:00:00');
                const diff = tempDate.getDate() - tempDate.getDay();
                const weekKey = new Date(tempDate.setDate(diff)).toDateString();

                services.push({
                    date: new Date(tempDate).toLocaleDateString('pt-BR'),
                    rawDate,
                    dayName: dayOfWeek === 0 ? 'Domingo' : 'Quinta-feira',
                    weekKey
                });
            }
            date.setDate(date.getDate() + 1);
        }

        // 3. Algoritmo de Sorteio (Bloco Semanal)
        const servicesByWeek = services.reduce((acc, s) => {
            if (!acc[s.weekKey]) acc[s.weekKey] = [];
            acc[s.weekKey].push(s);
            return acc;
        }, {});

        let pool = [...members].sort(() => Math.random() - 0.5);
        const generatedShifts: any[] = [];
        let memberIndex = 0;

        Object.values(servicesByWeek).forEach((weekServices: any) => {
            const weeklyTeam: string[] = [];
            let attempts = 0;
            const currentSize = ministryName.includes('Recepção') ? 1 : teamSize;

            while (weeklyTeam.length < currentSize && attempts < pool.length * 2) {
                // 1. Pegamos o objeto inteiro primeiro
                const candidateObj = pool[memberIndex % pool.length];

                // 2. Se por algum motivo bizarro o TypeScript achar que é undefined, pulamos a iteração
                if (!candidateObj) {
                    memberIndex++;
                    attempts++;
                    continue;
                }

                // 3. Agora o TypeScript tem certeza que candidateObj existe e tem a propriedade name
                const candidate = candidateObj.name;

                const isAvailable = weekServices.every((s: any) =>
                    !restrictions.some((r: any) => r.member === candidate && r.date === s.rawDate)
                );

                if (isAvailable && !weeklyTeam.includes(candidate)) {
                    weeklyTeam.push(candidate);
                }
                memberIndex++;
                attempts++;
            }

            const finalTeam = weeklyTeam.length > 0 ? weeklyTeam : ['SEM EQUIPE'];
            weekServices.forEach((s: any) => {
                generatedShifts.push({
                    date: s.date,
                    dayName: s.dayName,
                    team: finalTeam
                });
            });
        });

        return generatedShifts.sort((a, b) => {
            const dateA = a.date.split('/').reverse().join('-');
            const dateB = b.date.split('/').reverse().join('-');
            return dateA.localeCompare(dateB);
        });
    }
}