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
        // 1. Recebemos o louvorMode enviado pelo modal
        const { month, ministry: ministryName, teamSize, restrictions, louvorMode } = data;

        // 2. Busca o Ministério e os Membros no Postgres
        const ministry = await prisma.ministry.findUnique({ where: { name: ministryName } });
        if (!ministry) throw new Error("Ministério não encontrado");

        // 👇 PUXAMOS O ROLE E O TEAM TAMBÉM
        const members = await prisma.member.findMany({
            where: { ministry_id: ministry.id },
            select: { name: true, role: true, team: true }
        });

        if (members.length === 0) throw new Error("Nenhum membro cadastrado neste ministério");

        // 3. Lógica de Datas (Quintas e Domingos)
        const [year, monthNum] = month.split('-').map(Number);
        const date = new Date(year, monthNum - 1, 1);
        const services: any[] = [];

        while (date.getMonth() === monthNum - 1) {
            const dayOfWeek = date.getDay();
            if (dayOfWeek === 0 || dayOfWeek === 4) {
                const rawDate = date.toISOString().split('T')[0];
                const actualDate = new Date(rawDate + 'T12:00:00'); // 👈 Guarda a data real intacta

                const tempDate = new Date(rawDate + 'T12:00:00');
                const diff = tempDate.getDate() - tempDate.getDay();
                const weekKey = new Date(tempDate.setDate(diff)).toDateString();

                services.push({
                    date: actualDate.toLocaleDateString('pt-BR'), // 👈 Usa a data real aqui
                    rawDate,
                    dayName: dayOfWeek === 0 ? 'Domingo' : 'Quinta-feira',
                    weekKey
                });
            }
            date.setDate(date.getDate() + 1);
        }

        const servicesByWeek = services.reduce((acc, s) => {
            if (!acc[s.weekKey]) acc[s.weekKey] = [];
            acc[s.weekKey].push(s);
            return acc;
        }, {} as Record<string, any[]>);

        const generatedShifts: any[] = [];

        // ==============================================================
        // MODO 1: LOUVOR POR EQUIPES/BANDAS FIXAS
        // ==============================================================
        if (ministryName === 'Louvor' && louvorMode === 'EQUIPE') {
            const teamsMap = members.reduce((acc, m: any) => {
                if (m.team && m.team.name && m.team.name.trim() !== '') {
                    const tName = m.team.name.trim();
                    // Tipamos o acc para evitar o erro do index type
                    if (!acc[tName]) acc[tName] = [];
                    acc[tName].push(m.name);
                }
                return acc;
            }, {} as Record<string, string[]>);

            const availableTeams = Object.keys(teamsMap);
            if (availableTeams.length === 0) {
                throw new Error("Nenhuma banda cadastrada! Edite os membros e adicione uma 'Equipe', ou mude o modo para 'Avulsos'.");
            }

            let teamPool = [...availableTeams].sort(() => Math.random() - 0.5);
            let teamIdx = 0;

            Object.values(servicesByWeek).forEach((weekServices: any) => {
                let assignedTeamName = null;
                let attempts = 0;

                while (!assignedTeamName && attempts < teamPool.length * 2) {
                    const candidateTeam = teamPool[teamIdx % teamPool.length];
                    const teamMembers = teamsMap[candidateTeam] || [];

                    const teamIsAvailable = weekServices.every((s: any) =>
                        !restrictions?.some((r: any) => teamMembers.includes(r.member) && r.date === s.rawDate)
                    );

                    if (teamIsAvailable) assignedTeamName = candidateTeam;
                    teamIdx++;
                    attempts++;
                }

                const finalTeamMembers = assignedTeamName ? teamsMap[assignedTeamName] : ['SEM EQUIPE (Restrições)'];

                weekServices.forEach((s: any) => {
                    generatedShifts.push({ date: s.date, dayName: s.dayName, team: finalTeamMembers });
                });
            });
        }

        // ==============================================================
        // MODO 2: AVULSOS OU OUTROS MINISTÉRIOS (Sorteio Normal)
        // ==============================================================
        else {
            let pool = [...members].sort(() => Math.random() - 0.5);
            let memberIndex = 0;

            Object.values(servicesByWeek).forEach((weekServices: any) => {
                const weeklyTeam: string[] = [];
                let attempts = 0;
                const currentSize = ministryName.includes('Recepção') ? 1 : teamSize;

                while (weeklyTeam.length < currentSize && attempts < pool.length * 2) {
                    const candidateObj = pool[memberIndex % pool.length];

                    if (!candidateObj) {
                        memberIndex++;
                        attempts++;
                        continue;
                    }

                    const candidate = candidateObj.name;
                    const isAvailable = weekServices.every((s: any) =>
                        !restrictions.some((r: any) => r.member === candidate && r.date === s.rawDate)
                    );

                    if (isAvailable && !weeklyTeam.includes(candidate)) {
                        // Se for Louvor Avulso, podemos até adicionar a função dele (opcional)
                        // Ex: "João (Bateria)" - Vamos manter limpo só com nome por enquanto.
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
        }

        // 4. Retorna tudo ordenado
        return generatedShifts.sort((a, b) => {
            const dateA = a.date.split('/').reverse().join('-');
            const dateB = b.date.split('/').reverse().join('-');
            return dateA.localeCompare(dateB);
        });
    }

    async updateShiftTeam(shiftId: string, newTeamNames: string[]) {
        // 1. Encontra o turno e pega o ID do ministério para filtrar os membros corretos
        const shift = await prisma.shift.findUnique({
            where: { id: shiftId },
            include: { schedule: true }
        });

        if (!shift || !shift.schedule?.ministry_id) {
            throw new Error("Turno ou Ministério não encontrado.");
        }

        // 2. Busca os IDs dos novos membros baseados nos nomes recebidos
        const members = await prisma.member.findMany({
            where: {
                ministry_id: shift.schedule.ministry_id,
                name: { in: newTeamNames }
            }
        });

        // 3. Usamos uma "Transação" do Prisma para garantir que não haja falhas pela metade
        await prisma.$transaction(async (tx) => {
            // A) Remove quem estava escalado neste dia específico
            await tx.shiftAssignment.deleteMany({
                where: { shift_id: shiftId }
            });

            // B) Adiciona a nova equipe
            for (const member of members) {
                await tx.shiftAssignment.create({
                    data: {
                        shift_id: shiftId,
                        member_id: member.id
                    }
                });
            }
        });

        return { success: true, message: "Equipe atualizada com sucesso!" };
    }
}