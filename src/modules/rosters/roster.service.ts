import { prisma } from '../../shared/database/prisma.js';
import { CreateRosterBodyType } from './roster.schemas.js';
import axios from 'axios'; // Para enviar o JSON para o n8n
import dotenv from 'dotenv';

dotenv.config();

export class RosterService {

    async createRoster(data: CreateRosterBodyType) {
        const ministry = await prisma.ministry.findUnique({
            where: { name: data.ministry }
        });

        if (!ministry) throw new Error(`Ministério '${data.ministry}' não encontrado no banco.`);

        // Busca todos os membros do ministério para termos um mapa rápido por nome
        const membersList = await prisma.member.findMany({
            where: { ministry_id: ministry.id }
        });
        const memberMap = new Map(membersList.map(m => [m.name.trim(), m]));

        const schedule = await prisma.schedule.create({
            data: {
                month_reference: data.month,
                ministry_id: ministry.id,
            }
        });

        let whatsappBackupText = `📋 *ESCALA CONSOLIDADA - ${data.ministry.toUpperCase()}* 📋\n\n`;

        for (const shift of data.shifts) {
            const [day, month, year] = shift.date.split('/');
            const shiftDate = new Date(`${year}-${month}-${day}T12:00:00Z`);

            const createdShift = await prisma.shift.create({
                data: {
                    schedule_id: schedule.id,
                    shift_date: shiftDate,
                    day_name: shift.dayName
                }
            });

            whatsappBackupText += `📅 *DATA: ${shift.date} (${shift.dayName})*\n`;

            // Set para evitar inserir o mesmo membro duas vezes no mesmo culto por segurança
            const insertedMembersInShift = new Set<string>();

            for (const memberString of shift.team) {
                const match = memberString.match(/^(.*?) \((.*?)\)$/);
                const rawName = match ? (match[1] ?? "").trim() : memberString.trim();
                const areaName = match ? (match[2] ?? "").trim() : null;

                const memberObj = memberMap.get(rawName);

                if (memberObj && !insertedMembersInShift.has(memberObj.id)) {
                    insertedMembersInShift.add(memberObj.id);

                    await prisma.shiftAssignment.create({
                        data: {
                            shift_id: createdShift.id,
                            member_id: memberObj.id,
                            area_name: areaName
                        }
                    });

                    whatsappBackupText += ` 🔹 ${memberString}\n`;
                } else if (memberString.includes('FALTA GENTE')) {
                    whatsappBackupText += ` ⚠️ ${memberString}\n`;
                }
            }
            whatsappBackupText += `\n`;
        }

        return {
            schedule,
            whatsappBackupText: whatsappBackupText.trim()
        };
    }

    async getAllRosters(ministryFilter: string) {
        // 1. Busca as escalas no Prisma com todas as relações e áreas dos turnos
        const schedules = await prisma.schedule.findMany({
            where: ministryFilter !== 'all'
                ? { ministry: { name: ministryFilter } }
                : {},
            include: {
                ministry: true,
                author: { include: { profile: true } },
                shifts: {
                    orderBy: { shift_date: 'asc' },
                    include: {
                        members: {
                            include: { member: true } // Puxa o membro e a area_name salva na tabela shift_assignments
                        }
                    }
                }
            },
            orderBy: { created_at: 'desc' }
        });

        // 2. Mapeia e reconstrói o array 'team' garantindo que a área vá junto ("Nome (Área)")
        return schedules.map(schedule => ({
            id: schedule.id,
            ministry: schedule.ministry?.name || 'Geral',
            month: schedule.month_reference,
            createdBy: schedule.author?.profile?.full_name || schedule.author?.email || 'Sistema',
            createdAt: schedule.created_at,
            shifts: schedule.shifts.map(shift => ({
                id: shift.id,
                date: new Date(shift.shift_date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }),
                dayName: shift.day_name || '',
                team: shift.members.map(assignment => {
                    // Se houver uma área salva, retorna "Nome (Área)", senão apenas o nome
                    if (assignment.area_name) {
                        return `${assignment.member.name} (${assignment.area_name})`;
                    }
                    return assignment.member.name;
                })
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
        const { month, ministry: ministryName, teamSize, restrictions, louvorMode } = data;

        const ministry = await prisma.ministry.findUnique({ where: { name: ministryName } });
        if (!ministry) throw new Error("Ministério não encontrado");

        const members = await prisma.member.findMany({
            where: {
                ministry_id: ministry.id,
                is_active: true
            },
            select: { name: true, role: true, team: true, areas: { include: { area: true } } }
        });

        if (members.length === 0) throw new Error("Nenhum membro ativo cadastrado neste ministério");

        const [year, monthNum] = month.split('-').map(Number);
        const date = new Date(year, monthNum - 1, 1);
        const services: any[] = [];

        while (date.getMonth() === monthNum - 1) {
            const dayOfWeek = date.getDay();
            if (dayOfWeek === 0 || dayOfWeek === 4) {
                const rawDate = date.toISOString().split('T')[0];
                const actualDate = new Date(rawDate + 'T12:00:00');

                const tempDate = new Date(rawDate + 'T12:00:00');
                const diff = tempDate.getDate() - tempDate.getDay();
                const weekKey = new Date(tempDate.setDate(diff)).toDateString();

                services.push({
                    date: actualDate.toLocaleDateString('pt-BR'),
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

        // 👇 VERIFICAÇÃO BLINDADA PARA A MÍDIA 👇
        // Aceita Mídia, Midia, Multimídia ou Multimidia
        const isMedia = ministryName.includes('Mídia') || ministryName.includes('Midia') || ministryName.includes('Multimídia') || ministryName.includes('Multimidia');

        // ==============================================================
        // MODO 1: LOUVOR POR EQUIPES/BANDAS FIXAS
        // ==============================================================
        if (ministryName === 'Louvor' && louvorMode === 'EQUIPE') {
            const teamsMap = members.reduce((acc, m: any) => {
                if (m.team && m.team.name && m.team.name.trim() !== '') {
                    const tName = m.team.name.trim();
                    if (!acc[tName]) acc[tName] = [];
                    acc[tName].push(m.name);
                }
                return acc;
            }, {} as Record<string, string[]>);

            const availableTeams = Object.keys(teamsMap);
            if (availableTeams.length === 0) throw new Error("Nenhuma banda cadastrada!");

            let teamPool = [...availableTeams].sort(() => Math.random() - 0.5);
            let teamIdx = 0;

            Object.values(servicesByWeek).forEach((weekServices: any) => {
                let assignedTeamName = null;
                let attempts = 0;

                while (!assignedTeamName && attempts < teamPool.length * 2) {
                    const candidateTeam = teamPool[teamIdx % teamPool.length] as string;
                    const teamMembers = teamsMap[candidateTeam] || [];

                    const teamIsAvailable = weekServices.every((s: any) =>
                        !restrictions?.some((r: any) => teamMembers.includes(r.member) && r.date === s.rawDate)
                    );

                    if (teamIsAvailable) assignedTeamName = candidateTeam;
                    teamIdx++;
                    attempts++;
                }

                const finalTeamMembers = assignedTeamName ? teamsMap[assignedTeamName as string] : ['SEM EQUIPE (Restrições)'];

                weekServices.forEach((s: any) => {
                    generatedShifts.push({ date: s.date, dayName: s.dayName, team: finalTeamMembers });
                });
            });
        }
        // ==============================================================
        // 👇 MODO 2: ESCALA POR ÁREAS COM CONTINUIDADE REAL (DOM -> QUI) 👇
        // ==============================================================
        else if (louvorMode === 'AREAS' || isMedia) {

            const activeAreas = await prisma.ministryArea.findMany({
                where: { ministry_id: ministry.id }
            });

            if (activeAreas.length === 0) {
                throw new Error("Nenhuma área cadastrada! Cadastre áreas no painel.");
            }

            const memberUsageCount: Record<string, number> = {};
            members.forEach(m => memberUsageCount[m.name] = 0);

            const [year, monthNum] = month.split('-').map(Number);
            const date = new Date(year, monthNum - 1, 1);
            const services: any[] = [];

            while (date.getMonth() === monthNum - 1) {
                const dayOfWeek = date.getDay();
                if (dayOfWeek === 0 || dayOfWeek === 4) {
                    // Adicionando '!' para garantir ao TS que a string existe
                    const rawDate = date.toISOString().split('T')[0]!;
                    const actualDate = new Date(rawDate + 'T12:00:00');

                    const tempDate = new Date(rawDate + 'T12:00:00');
                    const diff = tempDate.getDate() - tempDate.getDay();
                    const sundayOfThisWeek = new Date(tempDate.setDate(diff));
                    const weekKey = sundayOfThisWeek.toISOString().split('T')[0]!;

                    services.push({
                        date: actualDate.toLocaleDateString('pt-BR'),
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

            const prevMonthDate = new Date(year, monthNum - 2, 1);
            const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;

            const lastSchedulePrevMonth = await prisma.schedule.findFirst({
                where: {
                    ministry_id: ministry.id,
                    month_reference: prevMonthStr
                },
                include: {
                    shifts: {
                        orderBy: { shift_date: 'desc' },
                        take: 1,
                        include: { members: { include: { member: true } } }
                    }
                }
            });

            let carryOverTeam: string[] = [];
            let lastSundayWeekKey = "";

            const lastShift = lastSchedulePrevMonth?.shifts?.[0];
            if (lastShift) {
                const shiftDateObj = new Date(lastShift.shift_date);
                // Adicionando '!' para garantir ao TS
                const rawLast = shiftDateObj.toISOString().split('T')[0]!;
                const tempD = new Date(rawLast + 'T12:00:00');

                if (tempD.getDay() === 0 && lastShift.members) {
                    carryOverTeam = lastShift.members.map(m =>
                        m.area_name ? `${m.member.name} (${m.area_name})` : m.member.name
                    );

                    const diff = tempD.getDate() - tempD.getDay();
                    const lastSunday = new Date(tempD.setDate(diff));
                    // Adicionando '!' para garantir ao TS
                    lastSundayWeekKey = lastSunday.toISOString().split('T')[0]!;
                }
            }

            let isFirstWeek = true;

            Object.entries(servicesByWeek).forEach(([weekKey, weekServices]: [string, any]) => {

                let weeklyShiftTeam: string[] = [];
                const busyMembers = new Set<string>();

                if (isFirstWeek && weekKey === lastSundayWeekKey && carryOverTeam.length > 0) {
                    weeklyShiftTeam = [...carryOverTeam];
                    isFirstWeek = false;

                    weekServices.forEach((s: any) => {
                        generatedShifts.push({
                            date: s.date,
                            dayName: s.dayName,
                            team: [...weeklyShiftTeam]
                        });
                    });
                    return;
                }

                isFirstWeek = false;

                for (const area of activeAreas) {
                    const eligibleMembers = members.filter(m =>
                        m.areas.some((a: any) => a.area_id === area.id)
                    );

                    const pool = [...eligibleMembers].sort((a, b) => {
                        const countA = memberUsageCount[a.name] || 0;
                        const countB = memberUsageCount[b.name] || 0;
                        if (countA !== countB) return countA - countB;
                        return Math.random() - 0.5;
                    });

                    let assigned = false;
                    for (const candidate of pool) {
                        const hasRestrictionInWeek = weekServices.some((s: any) =>
                            restrictions.some((r: any) => r.member === candidate.name && r.date === s.rawDate)
                        );

                        const isBusyInAnotherArea = busyMembers.has(candidate.name);

                        if (!hasRestrictionInWeek && !isBusyInAnotherArea) {
                            weeklyShiftTeam.push(`${candidate.name} (${area.name})`);
                            busyMembers.add(candidate.name);
                            memberUsageCount[candidate.name] = (memberUsageCount[candidate.name] || 0) + 1;
                            assigned = true;
                            break;
                        }
                    }

                    if (!assigned) {
                        weeklyShiftTeam.push(`⚠️ FALTA GENTE (${area.name})`);
                    }
                }

                weekServices.forEach((s: any) => {
                    generatedShifts.push({
                        date: s.date,
                        dayName: s.dayName,
                        team: [...weeklyShiftTeam]
                    });
                });
            });
        }
        // ==============================================================
        // MODO 3: AVULSOS OU OUTROS MINISTÉRIOS (Sorteio Simples)
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

        return generatedShifts.sort((a, b) => {
            const dateA = a.date.split('/').reverse().join('-');
            const dateB = b.date.split('/').reverse().join('-');
            return dateA.localeCompare(dateB);
        });
    }

    async updateShiftTeam(shiftId: string, newTeamNames: string[]) {
        const shift = await prisma.shift.findUnique({
            where: { id: shiftId },
            include: { schedule: true }
        });

        // Tratamento seguro para evitar erro de schedule null/undefined
        const ministryId = shift?.schedule?.ministry_id;
        if (!shift || !ministryId) {
            throw new Error("Turno ou Ministério não encontrado.");
        }

        await prisma.$transaction(async (tx) => {
            await tx.shiftAssignment.deleteMany({
                where: { shift_id: shiftId }
            });

            for (const memberString of newTeamNames) {
                const match = memberString.match(/^(.*?) \((.*?)\)$/);
                // 👇 Forçamos a conversão segura para string
                const rawName = match ? (match[1] ?? "").trim() : memberString.trim();
                const areaName = match ? (match[2] ?? "").trim() : null;

                const member = await tx.member.findFirst({
                    where: {
                        ministry_id: ministryId,
                        name: rawName
                    }
                });

                if (member) {
                    await tx.shiftAssignment.create({
                        data: {
                            shift_id: shiftId,
                            member_id: member.id,
                            area_name: areaName
                        }
                    });
                }
            }
        });

        return { success: true, message: "Equipe atualizada com sucesso!" };
    }

    async syncRosterToCalendar(rosterData: any) {
        // 1. Busca Ministério e membros com e-mail
        const ministry = await prisma.ministry.findUnique({
            where: { name: rosterData.ministry }
        });
        if (!ministry) throw new Error(`Ministério '${rosterData.ministry}' não encontrado.`);

        const membersList = await prisma.member.findMany({
            where: { ministry_id: ministry.id },
            select: { name: true, email: true }
        });
        const memberEmailMap = new Map(membersList.map(m => [m.name, m.email]));

        // 2. Monta o array de convites (o JSON que o n8n espera)
        const invites = [];
        for (const shift of rosterData.shifts) {
            for (const memberName of shift.team) {
                const email = memberEmailMap.get(memberName);

                // Só adiciona ao JSON se o membro tiver e-mail cadastrado
                if (email && email.trim() !== '') {
                    const emailTitle = `Escala de ${rosterData.month} - ${rosterData.ministry}`;
                    let startTime = "";
                    let endTime = "";

                    if (shift.dayName === 'Domingo') {
                        startTime = "17:00";
                        endTime = "20:00";
                    } else if (shift.dayName === 'Quinta-feira') {
                        startTime = "18:30";
                        endTime = "21:00";
                    }

                    invites.push({
                        member_name: memberName,
                        member_email: email,
                        event_date: shift.date.split('/').reverse().join('-'),
                        start_event_time: startTime, // 👈 Usa a variável dinâmica
                        end_event_time: endTime,     // 👈 Usa a variável dinâmica
                        day_name: shift.dayName,
                        email_title: `${emailTitle} (${shift.dayName})`
                    });
                }
            }
        }

        // 3. Dispara para o Webhook do n8n (Substitua pela sua URL real)
        if (invites.length > 0) {
            await axios.post(process.env.WEBHOOK_URL || '', {
                ministry: rosterData.ministry,
                roster_month: rosterData.month,
                invites: invites
            });
        }
    }
}