import { prisma } from '../../shared/database/prisma.js';
import { CreateRosterBodyType } from './roster.schemas.js';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

export class RosterService {

    async findScheduleById(id: string) {
        return await prisma.schedule.findUnique({
            where: { id },
            include: { ministry: true, congregation: true }
        });
    }

    async findShiftById(shiftId: string) {
        return await prisma.shift.findUnique({
            where: { id: shiftId },
            include: { schedule: { include: { ministry: true, congregation: true } } }
        });
    }

    async getRosterSettings(): Promise<Record<string, any>> {
        try {
            const records: any[] = await prisma.$queryRawUnsafe(`
                SELECT role_permissions FROM app.system_permissions WHERE id = 'roster_settings' LIMIT 1
            `);
            if (records && records.length > 0 && records[0].role_permissions) {
                return records[0].role_permissions;
            }
        } catch (err) {
            console.error("Erro ao buscar roster_settings do banco:", err);
        }
        return {
            '79bd86d4-5d41-42a5-8214-60f1f62118e8': {
                name: 'Italage',
                defaultMode: 'RODIZIO_CULTO',
                ministryModes: { 'Multimídia': 'RODIZIO_CULTO' }
            },
            'f8abdc90-f3f0-4af4-87cb-f1721bf4993d': {
                name: 'Sede',
                defaultMode: 'CONTINUIDADE_SEMANAL',
                ministryModes: { 'Multimídia': 'CONTINUIDADE_SEMANAL', 'Louvor': 'EQUIPES' }
            }
        };
    }

    async saveRosterSettings(congregationId: string, settings: any) {
        const currentSettings = await this.getRosterSettings();
        currentSettings[congregationId] = {
            ...currentSettings[congregationId],
            ...settings
        };

        await prisma.$executeRawUnsafe(
            `INSERT INTO app.system_permissions (id, role_permissions, updated_at)
             VALUES ('roster_settings', $1::jsonb, NOW())
             ON CONFLICT (id) DO UPDATE SET role_permissions = $1::jsonb, updated_at = NOW()`,
            JSON.stringify(currentSettings)
        );

        return currentSettings;
    }

    async createRoster(data: CreateRosterBodyType) {
        let targetCongregationId = data.congregationId;
        if (!targetCongregationId) {
            const sede = await prisma.congregation.findFirst({ where: { is_main: true } });
            if (sede) targetCongregationId = sede.id;
        }

        const ministry = await prisma.ministry.findFirst({
            where: {
                name: { equals: data.ministry, mode: 'insensitive' },
                ...(targetCongregationId ? { congregation_id: targetCongregationId } : {})
            }
        });

        if (!ministry) throw new Error(`Ministério '${data.ministry}' não encontrado para esta congregação.`);

        const membersList = await prisma.member.findMany({
            where: {
                ministry_id: ministry.id,
                ...(targetCongregationId ? { congregation_id: targetCongregationId } : {}),
                is_active: true
            }
        });
        const memberMap = new Map(membersList.map(m => [m.name.trim(), m]));

        return await prisma.$transaction(async (tx) => {
            const schedule = await tx.schedule.create({
                data: {
                    month_reference: data.month,
                    ministry_id: ministry.id,
                    congregation_id: targetCongregationId || null,
                    author_id: data.authorId || null
                }
            });

            let whatsappBackupText = `📋 *ESCALA CONSOLIDADA - ${data.ministry.toUpperCase()}* 📋\n\n`;

            for (const shift of data.shifts) {
                const dateParts = shift.date.split('/');
                let shiftDate: Date;
                if (dateParts.length === 3 && dateParts[0] && dateParts[1] && dateParts[2]) {
                    const [day, month, year] = dateParts;
                    shiftDate = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T12:00:00Z`);
                } else {
                    shiftDate = new Date(shift.date);
                }

                const createdShift = await tx.shift.create({
                    data: {
                        schedule_id: schedule.id,
                        shift_date: shiftDate,
                        day_name: shift.dayName
                    }
                });

                whatsappBackupText += `📅 *DATA: ${shift.date} (${shift.dayName})*\n`;

                const insertedMembersInShift = new Set<string>();

                for (const memberString of shift.team) {
                    const match = memberString.match(/^(.*?) \((.*?)\)$/);
                    const rawName = match ? (match[1] ?? "").trim() : memberString.trim();
                    const areaName = match ? (match[2] ?? "").trim() : null;

                    const memberObj = memberMap.get(rawName);

                    if (memberObj && !insertedMembersInShift.has(memberObj.id)) {
                        insertedMembersInShift.add(memberObj.id);

                        await tx.shiftAssignment.create({
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
        });
    }

    async getAllRosters(ministryFilter: string = 'all', congregationId?: string) {
        let whereCondition: any = {};

        if (ministryFilter && ministryFilter !== 'all') {
            whereCondition.ministry = {
                name: { equals: ministryFilter, mode: 'insensitive' }
            };
        }

        if (congregationId) {
            whereCondition.congregation_id = congregationId;
        }

        const schedules = await prisma.schedule.findMany({
            where: whereCondition,
            include: {
                ministry: true,
                congregation: true,
                shifts: {
                    orderBy: { shift_date: 'asc' },
                    include: {
                        members: {
                            include: {
                                member: true
                            }
                        }
                    }
                }
            },
            orderBy: { created_at: 'desc' }
        });

        return schedules.map(schedule => ({
            id: schedule.id,
            month: schedule.month_reference,
            ministry: schedule.ministry?.name || 'Geral',
            congregation_id: schedule.congregation_id,
            congregation: schedule.congregation,
            shifts: schedule.shifts.map(shift => {
                const shiftDate = new Date(shift.shift_date);
                const day = String(shiftDate.getUTCDate()).padStart(2, '0');
                const month = String(shiftDate.getUTCMonth() + 1).padStart(2, '0');
                const year = shiftDate.getUTCFullYear();
                const formattedDate = `${day}/${month}/${year}`;

                return {
                    id: shift.id,
                    date: formattedDate,
                    dayName: shift.day_name || '',
                    team: shift.members.map(sm => {
                        const name = sm.member?.name || 'Membro';
                        return sm.area_name ? `${name} (${sm.area_name})` : name;
                    })
                };
            })
        }));
    }

    async deleteRoster(id: string) {
        await prisma.schedule.delete({
            where: { id }
        });
        return { success: true };
    }

    // ==============================================================
    // NOVO MODELO: RODÍZIO CULTO A CULTO (SEMANAL ALTERNADO - ITALAGE)
    // Ninguém trabalha duas vezes na mesma semana; duplas e funções alternam a cada culto.
    // ==============================================================
    async generateRodizioCultoRoster(params: {
        month: string;
        ministry: any;
        members: any[];
        services: any[];
        safeRestrictions: any[];
        teamSize?: number;
        targetCongregationId?: string;
    }) {
        const { month, ministry, members, services, safeRestrictions, teamSize = 1, targetCongregationId } = params;

        const activeAreas = await prisma.ministryArea.findMany({
            where: { ministry_id: ministry.id }
        });

        const [yearStr, monthNumStr] = month.split('-');
        const yearR = Number(yearStr);
        const monthNumR = Number(monthNumStr);
        const prevMonthDate = new Date(yearR, monthNumR - 2, 1);
        const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;

        const lastSchedulePrevMonth = await prisma.schedule.findFirst({
            where: {
                ministry_id: ministry.id,
                month_reference: prevMonthStr,
                ...(targetCongregationId ? { congregation_id: targetCongregationId } : {})
            },
            include: {
                shifts: {
                    orderBy: { shift_date: 'desc' },
                    take: 1,
                    include: { members: { include: { member: true } } }
                }
            }
        });

        const memberUsageCount: Record<string, number> = {};
        const memberAreaUsage: Record<string, Record<string, number>> = {};
        const memberLastArea: Record<string, string> = {};
        const memberLastServiceIdx: Record<string, number> = {};
        const pairHistory: Record<string, Record<string, number>> = {};
        const weeklyAssignments: Record<string, Set<string>> = {};

        members.forEach(m => {
            const name = m.name.trim();
            memberUsageCount[name] = 0;
            memberAreaUsage[name] = {};
            activeAreas.forEach(a => {
                const map = memberAreaUsage[name];
                if (map) map[a.name] = 0;
            });
            memberLastServiceIdx[name] = -999;
            pairHistory[name] = {};
            members.forEach(m2 => {
                const map = pairHistory[name];
                if (map) map[m2.name.trim()] = 0;
            });
        });

        // Transição suave com o mês anterior
        if (lastSchedulePrevMonth?.shifts?.[0]?.members) {
            lastSchedulePrevMonth.shifts[0].members.forEach((sm: any) => {
                if (sm.member) {
                    const name = sm.member.name.trim();
                    if (memberLastServiceIdx[name] !== undefined) {
                        memberLastServiceIdx[name] = -1;
                        if (sm.area_name) {
                            memberLastArea[name] = sm.area_name;
                        }
                    }
                }
            });
        }

        const generatedShifts: any[] = [];

        services.forEach((s, i) => {
            if (!weeklyAssignments[s.weekKey]) {
                weeklyAssignments[s.weekKey] = new Set<string>();
            }

            const assignedThisService: string[] = [];
            const shiftTeam: string[] = [];

            if (activeAreas.length > 0) {
                for (const area of activeAreas) {
                    const eligibleMembers = members.filter(m => {
                        return m.areas && m.areas.length > 0
                            ? m.areas.some((a: any) => a.area_id === area.id || a.area?.name?.trim().toLowerCase() === area.name.trim().toLowerCase())
                            : true;
                    });

                    const candidates = eligibleMembers.filter(m => {
                        const mName = m.name.trim();
                        if (assignedThisService.includes(mName)) return false;
                        const hasRest = safeRestrictions.some((r: any) => r.member?.trim() === mName && r.date === s.rawDate);
                        return !hasRest;
                    });

                    if (candidates.length === 0) {
                        shiftTeam.push(`⚠️ FALTA GENTE (${area.name})`);
                        continue;
                    }

                    let bestCandidate: any = null;
                    let bestScore = Infinity;

                    for (const cand of candidates) {
                        const candName = cand.name.trim();
                        let score = 0;

                        // 1. Penalidade máxima para quem já serviu na mesma semana (garante o descanso semanal!)
                        if (weeklyAssignments[s.weekKey]?.has(candName)) {
                            score += 10000;
                        }

                        // 2. Balanceamento de vezes que serviu no mês
                        score += (memberUsageCount[candName] || 0) * 100;

                        // 3. Mistura dinâmica de duplas (penaliza quem já serviu junto no mês)
                        for (const other of assignedThisService) {
                            score += (pairHistory[candName]?.[other] || 0) * 60;
                        }

                        // 4. Alternância de áreas (quem fez menos esta área tem preferência)
                        score += (memberAreaUsage[candName]?.[area.name] || 0) * 30;

                        // 5. Evita repetir a mesma área em turnos seguidos
                        if (memberLastArea[candName] === area.name) {
                            score += 15;
                        }

                        // 6. Desempate: quem descansou há mais cultos tem preferência
                        const cultsSince = i - (memberLastServiceIdx[candName] ?? -999);
                        score -= Math.min(cultsSince, 5);

                        if (score < bestScore) {
                            bestScore = score;
                            bestCandidate = cand;
                        }
                    }

                    if (bestCandidate) {
                        const chosenName = bestCandidate.name.trim();
                        assignedThisService.push(chosenName);
                        if (!weeklyAssignments[s.weekKey]) {
                            weeklyAssignments[s.weekKey] = new Set<string>();
                        }
                        weeklyAssignments[s.weekKey]?.add(chosenName);

                        memberUsageCount[chosenName] = (memberUsageCount[chosenName] || 0) + 1;
                        if (!memberAreaUsage[chosenName]) memberAreaUsage[chosenName] = {};
                        memberAreaUsage[chosenName][area.name] = (memberAreaUsage[chosenName][area.name] || 0) + 1;
                        memberLastArea[chosenName] = area.name;
                        memberLastServiceIdx[chosenName] = i;

                        for (const other of assignedThisService) {
                            if (other !== chosenName) {
                                if (!pairHistory[chosenName]) pairHistory[chosenName] = {};
                                if (!pairHistory[other]) pairHistory[other] = {};
                                pairHistory[chosenName][other] = (pairHistory[chosenName][other] || 0) + 1;
                                pairHistory[other][chosenName] = (pairHistory[other][chosenName] || 0) + 1;
                            }
                        }

                        shiftTeam.push(`${chosenName} (${area.name})`);
                    } else {
                        shiftTeam.push(`⚠️ FALTA GENTE (${area.name})`);
                    }
                }
            } else {
                // Ministério sem áreas fixas (ex: Recepção)
                const currentSize = ministry.name.includes('Recepção') ? 1 : (teamSize || 1);

                for (let slot = 0; slot < currentSize; slot++) {
                    const candidates = members.filter(m => {
                        const mName = m.name.trim();
                        if (assignedThisService.includes(mName)) return false;
                        const hasRest = safeRestrictions.some((r: any) => r.member?.trim() === mName && r.date === s.rawDate);
                        return !hasRest;
                    });

                    if (candidates.length === 0) {
                        shiftTeam.push(`⚠️ FALTA GENTE (${ministry.name})`);
                        continue;
                    }

                    let bestCandidate: any = null;
                    let bestScore = Infinity;

                    for (const cand of candidates) {
                        const candName = cand.name.trim();
                        let score = 0;

                        if (weeklyAssignments[s.weekKey]?.has(candName)) score += 10000;
                        score += (memberUsageCount[candName] || 0) * 100;

                        for (const other of assignedThisService) {
                            score += (pairHistory[candName]?.[other] || 0) * 60;
                        }

                        const cultsSince = i - (memberLastServiceIdx[candName] ?? -999);
                        score -= Math.min(cultsSince, 5);

                        if (score < bestScore) {
                            bestScore = score;
                            bestCandidate = cand;
                        }
                    }

                    if (bestCandidate) {
                        const chosenName = bestCandidate.name.trim();
                        assignedThisService.push(chosenName);
                        if (!weeklyAssignments[s.weekKey]) {
                            weeklyAssignments[s.weekKey] = new Set<string>();
                        }
                        weeklyAssignments[s.weekKey]?.add(chosenName);

                        memberUsageCount[chosenName] = (memberUsageCount[chosenName] || 0) + 1;
                        memberLastServiceIdx[chosenName] = i;

                        for (const other of assignedThisService) {
                            if (other !== chosenName) {
                                if (!pairHistory[chosenName]) pairHistory[chosenName] = {};
                                if (!pairHistory[other]) pairHistory[other] = {};
                                pairHistory[chosenName][other] = (pairHistory[chosenName][other] || 0) + 1;
                                pairHistory[other][chosenName] = (pairHistory[other][chosenName] || 0) + 1;
                            }
                        }

                        shiftTeam.push(chosenName);
                    } else {
                        shiftTeam.push(`⚠️ FALTA GENTE (${ministry.name})`);
                    }
                }
            }

            generatedShifts.push({
                date: s.date,
                dayName: s.dayName,
                team: [...shiftTeam]
            });
        });

        return generatedShifts.sort((a, b) => {
            const dateA = a.date.split('/').reverse().join('-');
            const dateB = b.date.split('/').reverse().join('-');
            return dateA.localeCompare(dateB);
        });
    }

    async generateRosterPreview(data: any) {
        const { month, ministry: ministryName, teamSize, restrictions, louvorMode, congregationId, customCultDays, rosterMode } = data;
        const safeRestrictions: any[] = Array.isArray(restrictions) ? restrictions : [];

        let targetCongregationId = congregationId;
        let cultDaysList: string[] = [];

        let cong: any = null;
        if (targetCongregationId) {
            cong = await prisma.congregation.findUnique({ where: { id: targetCongregationId } });
            if (cong && cong.cult_days && cong.cult_days.length > 0) {
                cultDaysList = cong.cult_days;
            }
        } else {
            const sede = await prisma.congregation.findFirst({ where: { is_main: true } });
            if (sede) {
                cong = sede;
                targetCongregationId = sede.id;
                cultDaysList = sede.cult_days;
            }
        }

        if (Array.isArray(customCultDays) && customCultDays.length > 0) {
            cultDaysList = customCultDays;
        }

        if (cultDaysList.length === 0) {
            cultDaysList = ['DOMINGO', 'QUINTA'];
        }

        const dayMap: Record<string, number> = {
            'DOMINGO': 0,
            'SEGUNDA': 1,
            'TERCA': 2,
            'QUARTA': 3,
            'QUINTA': 4,
            'SEXTA': 5,
            'SABADO': 6
        };

        const dayNamesPt: Record<number, string> = {
            0: 'Domingo',
            1: 'Segunda-feira',
            2: 'Terça-feira',
            3: 'Quarta-feira',
            4: 'Quinta-feira',
            5: 'Sexta-feira',
            6: 'Sábado'
        };

        const allowedDaysOfWeek = cultDaysList.map(d => dayMap[d.toUpperCase()]).filter(d => d !== undefined);

        const ministry = await prisma.ministry.findFirst({
            where: {
                name: { equals: ministryName, mode: 'insensitive' },
                ...(targetCongregationId ? { congregation_id: targetCongregationId } : {})
            }
        });

        if (!ministry) throw new Error("Ministério não encontrado para esta congregação");

        const members: any[] = await prisma.member.findMany({
            where: {
                ministry_id: ministry.id,
                ...(targetCongregationId ? { congregation_id: targetCongregationId } : {}),
                is_active: true
            },
            select: { name: true, role: true, team: true, areas: { include: { area: true } } }
        });

        if (members.length === 0) throw new Error("Nenhum membro ativo cadastrado neste ministério para esta congregação");

        const activeMemberNames = new Set(members.map(m => m.name.trim()));

        const [year, monthNum] = month.split('-').map(Number);
        const date = new Date(year, monthNum - 1, 1);
        const services: any[] = [];

        while (date.getMonth() === monthNum - 1) {
            const dayOfWeek = date.getDay();
            if (allowedDaysOfWeek.includes(dayOfWeek)) {
                const rawDate = date.toISOString().split('T')[0];
                const actualDate = new Date(rawDate + 'T12:00:00');

                const tempDate = new Date(rawDate + 'T12:00:00');
                const diff = tempDate.getDate() - tempDate.getDay();
                const sunday = new Date(tempDate.setDate(diff));
                const weekKey = sunday.toISOString().split('T')[0]!;

                services.push({
                    date: actualDate.toLocaleDateString('pt-BR'),
                    rawDate,
                    dayName: dayNamesPt[dayOfWeek] || 'Culto',
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
        const isMedia = ministryName.includes('Mídia') || ministryName.includes('Midia') || ministryName.includes('Multimídia') || ministryName.includes('Multimidia');

        // Determinação inteligente do modo de escala efetivo
        let effectiveMode = rosterMode;
        if (!effectiveMode || effectiveMode === 'AUTO') {
            const allSettings = await this.getRosterSettings();
            const congSettings = targetCongregationId ? allSettings[targetCongregationId] : null;
            effectiveMode = congSettings?.ministryModes?.[ministryName] || congSettings?.defaultMode;

            if (!effectiveMode) {
                if (cong && !cong.is_main) {
                    effectiveMode = 'RODIZIO_CULTO';
                } else if (ministryName === 'Louvor') {
                    effectiveMode = louvorMode === 'AVULSO' ? 'AVULSO' : 'EQUIPES';
                } else if (isMedia || louvorMode === 'AREAS') {
                    effectiveMode = 'CONTINUIDADE_SEMANAL';
                } else {
                    effectiveMode = 'AVULSO';
                }
            }
        }

        // ==============================================================
        // MODO 1: RODÍZIO CULTO A CULTO (SEMANAL ALTERNADO - ITALAGE)
        // ==============================================================
        if (effectiveMode === 'RODIZIO_CULTO') {
            return await this.generateRodizioCultoRoster({
                month,
                ministry,
                members,
                services,
                safeRestrictions,
                teamSize,
                targetCongregationId
            });
        }

        // ==============================================================
        // MODO 2: LOUVOR POR SORTEIO CRUZADO (VOCAL + BANDA)
        // ==============================================================
        if (effectiveMode === 'EQUIPES' || (ministryName === 'Louvor' && (effectiveMode === 'EQUIPES' || louvorMode === 'EQUIPE') && effectiveMode !== 'AVULSO' && effectiveMode !== 'RODIZIO_CULTO' && effectiveMode !== 'CONTINUIDADE_SEMANAL')) {
            const teamsMap = members.reduce((acc, m: any) => {
                if (m.team && m.team.name && m.team.name.trim() !== '') {
                    const tName = m.team.name.trim();
                    if (!acc[tName]) acc[tName] = [];
                    acc[tName].push({ name: m.name.trim(), role: m.role || 'Membro' });
                }
                return acc;
            }, {} as Record<string, { name: string, role: string }[]>);

            const allTeamNames = Object.keys(teamsMap);
            if (allTeamNames.length === 0) {
                throw new Error("Nenhuma equipe cadastrada com membros ativos nesta congregação! Cadastre bandas/equipes no menu Ministérios ou selecione o modelo 'Rodízio Culto a Culto' ou 'Sorteio Simples'.");
            }

            const vocalTeams = allTeamNames.filter(t => t.toUpperCase().includes('VOCAL'));
            const bandTeams = allTeamNames.filter(t => !t.toUpperCase().includes('VOCAL'));
            const hasCrossVocalsAndBands = vocalTeams.length > 0 && bandTeams.length > 0;

            const vocalUsageCount: Record<string, number> = {};
            vocalTeams.forEach(t => vocalUsageCount[t] = 0);

            const bandUsageCount: Record<string, number> = {};
            bandTeams.forEach(t => bandUsageCount[t] = 0);

            const genericTeamUsageCount: Record<string, number> = {};
            allTeamNames.forEach(t => genericTeamUsageCount[t] = 0);

            const [yearL, monthNumL] = month.split('-').map(Number);
            const dateL = new Date(yearL, monthNumL - 1, 1);
            const safeServices: any[] = [];

            while (dateL.getMonth() === monthNumL - 1) {
                const dayOfWeek = dateL.getDay();
                if (allowedDaysOfWeek.includes(dayOfWeek)) {
                    const rawDate = dateL.toISOString().split('T')[0]!;
                    const actualDate = new Date(rawDate + 'T12:00:00');

                    const tempDate = new Date(rawDate + 'T12:00:00');
                    const diff = tempDate.getDate() - tempDate.getDay();
                    const sundayOfThisWeek = new Date(tempDate.setDate(diff));
                    const weekKey = sundayOfThisWeek.toISOString().split('T')[0]!;

                    safeServices.push({
                        date: actualDate.toLocaleDateString('pt-BR'),
                        rawDate,
                        dayName: dayNamesPt[dayOfWeek] || 'Culto',
                        weekKey
                    });
                }
                dateL.setDate(dateL.getDate() + 1);
            }

            const safeServicesByWeek = safeServices.reduce((acc, s) => {
                if (!acc[s.weekKey]) acc[s.weekKey] = [];
                acc[s.weekKey].push(s);
                return acc;
            }, {} as Record<string, any[]>);

            const prevMonthDate = new Date(yearL, monthNumL - 2, 1);
            const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;

            const lastSchedulePrevMonth = await prisma.schedule.findFirst({
                where: {
                    ministry_id: ministry.id,
                    month_reference: prevMonthStr,
                    ...(targetCongregationId ? { congregation_id: targetCongregationId } : {})
                },
                include: {
                    shifts: {
                        orderBy: { shift_date: 'desc' },
                        take: 1,
                        include: { members: { include: { member: true } } }
                    }
                }
            });

            let lastSundayWeekKey = "";
            let carryVocalTeam: string | null = null;
            let carryBandTeam: string | null = null;

            const lastShift = lastSchedulePrevMonth?.shifts?.[0];
            if (lastShift) {
                const shiftDateObj = new Date(lastShift.shift_date);
                const rawLast = shiftDateObj.toISOString().split('T')[0]!;
                const tempD = new Date(rawLast + 'T12:00:00');

                if (tempD.getDay() === 0 && lastShift.members) {
                    const diff = tempD.getDate() - tempD.getDay();
                    const lastSunday = new Date(tempD.setDate(diff));
                    lastSundayWeekKey = lastSunday.toISOString().split('T')[0]!;

                    const activeShiftMembers = lastShift.members.filter((sm: any) => sm.member?.is_active);

                    for (const vTeam of vocalTeams) {
                        const vMembers = teamsMap[vTeam] || [];
                        if (vMembers.length > 0 && vMembers.some((vm: any) => activeShiftMembers.some((sm: any) => sm.member?.name.trim() === vm.name))) {
                            carryVocalTeam = vTeam;
                            break;
                        }
                    }

                    for (const bTeam of bandTeams) {
                        const bMembers = teamsMap[bTeam] || [];
                        if (bMembers.length > 0 && bMembers.some((bm: any) => activeShiftMembers.some((sm: any) => sm.member?.name.trim() === bm.name))) {
                            carryBandTeam = bTeam;
                            break;
                        }
                    }
                }
            }

            let isFirstWeek = true;

            Object.entries(safeServicesByWeek).forEach(([weekKey, weekServices]: [string, any]) => {
                let assignedVocalTeamName: string | null = null;
                let assignedBandTeamName: string | null = null;
                let weeklyShiftTeam: string[] = [];

                if (isFirstWeek && weekKey === lastSundayWeekKey) {
                    if (carryVocalTeam) {
                        const vMembers = teamsMap[carryVocalTeam] || [];
                        const isAvailable = weekServices.every((s: any) =>
                            !safeRestrictions.some((r: any) => vMembers.some((m: any) => m.name.trim() === r.member?.trim()) && r.date === s.rawDate)
                        );
                        if (isAvailable) {
                            assignedVocalTeamName = carryVocalTeam;
                            vocalUsageCount[carryVocalTeam] = (vocalUsageCount[carryVocalTeam] || 0) + 1;
                        }
                    }

                    if (carryBandTeam) {
                        const bMembers = teamsMap[carryBandTeam] || [];
                        const isAvailable = weekServices.every((s: any) =>
                            !safeRestrictions.some((r: any) => bMembers.some((m: any) => m.name.trim() === r.member?.trim()) && r.date === s.rawDate)
                        );
                        if (isAvailable) {
                            assignedBandTeamName = carryBandTeam;
                            bandUsageCount[carryBandTeam] = (bandUsageCount[carryBandTeam] || 0) + 1;
                        }
                    }
                }
                isFirstWeek = false;

                const sortedVocals = [...vocalTeams].sort((a, b) => {
                    const uA = vocalUsageCount[a] ?? 0;
                    const uB = vocalUsageCount[b] ?? 0;
                    if (uA !== uB) return uA - uB;
                    return Math.random() - 0.5;
                });

                const sortedBands = [...bandTeams].sort((a, b) => {
                    const uA = bandUsageCount[a] ?? 0;
                    const uB = bandUsageCount[b] ?? 0;
                    if (uA !== uB) return uA - uB;
                    return Math.random() - 0.5;
                });

                if (!assignedVocalTeamName) {
                    for (const candidateVocal of sortedVocals) {
                        const vocalMembers = teamsMap[candidateVocal] || [];
                        const isAvailable = weekServices.every((s: any) =>
                            !safeRestrictions.some((r: any) => vocalMembers.some((m: any) => m.name.trim() === r.member?.trim()) && r.date === s.rawDate)
                        );

                        if (isAvailable) {
                            assignedVocalTeamName = candidateVocal;
                            vocalUsageCount[candidateVocal] = (vocalUsageCount[candidateVocal] || 0) + 1;
                            break;
                        }
                    }
                }

                if (!assignedBandTeamName) {
                    for (const candidateBand of sortedBands) {
                        const bandMembers = teamsMap[candidateBand] || [];
                        const isAvailable = weekServices.every((s: any) =>
                            !safeRestrictions.some((r: any) => bandMembers.some((m: any) => m.name.trim() === r.member?.trim()) && r.date === s.rawDate)
                        );

                        if (isAvailable) {
                            assignedBandTeamName = candidateBand;
                            bandUsageCount[candidateBand] = (bandUsageCount[candidateBand] || 0) + 1;
                            break;
                        }
                    }
                }

                if (hasCrossVocalsAndBands) {
                    if (assignedVocalTeamName) {
                        const vocals = teamsMap[assignedVocalTeamName] || [];
                        vocals.forEach((v: any) => weeklyShiftTeam.push(`${v.name} (${v.role || 'Vocal'})`));
                    } else {
                        weeklyShiftTeam.push('⚠️ SEM VOCAL (Restrições)');
                    }

                    if (assignedBandTeamName) {
                        const bandMembers = teamsMap[assignedBandTeamName] || [];
                        bandMembers.forEach((b: any) => weeklyShiftTeam.push(`${b.name} (${b.role || 'Banda'})`));
                    } else {
                        weeklyShiftTeam.push('⚠️ SEM BANDA (Restrições)');
                    }
                } else {
                    const sortedGeneric = [...allTeamNames].sort((a, b) => {
                        const uA = genericTeamUsageCount[a] ?? 0;
                        const uB = genericTeamUsageCount[b] ?? 0;
                        if (uA !== uB) return uA - uB;
                        return Math.random() - 0.5;
                    });
                    let assignedGenericTeam: string | null = null;
                    for (const candTeam of sortedGeneric) {
                        const tMembers = teamsMap[candTeam] || [];
                        const isAvailable = weekServices.every((s: any) =>
                            !safeRestrictions.some((r: any) => tMembers.some((m: any) => m.name.trim() === r.member?.trim()) && r.date === s.rawDate)
                        );
                        if (isAvailable) {
                            assignedGenericTeam = candTeam;
                            genericTeamUsageCount[candTeam] = (genericTeamUsageCount[candTeam] || 0) + 1;
                            break;
                        }
                    }
                    if (assignedGenericTeam) {
                        const tMembers = teamsMap[assignedGenericTeam] || [];
                        tMembers.forEach((m: any) => weeklyShiftTeam.push(`${m.name} (${m.role || assignedGenericTeam})`));
                    } else {
                        weeklyShiftTeam.push('⚠️ SEM EQUIPE (Restrições)');
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
        // MODO 3: ESCALA POR ÁREAS COM CONTINUIDADE SEMANAL (DOM -> QUI / QUA)
        // ==============================================================
        else if (effectiveMode === 'CONTINUIDADE_SEMANAL' || louvorMode === 'AREAS' || isMedia) {
            const activeAreas = await prisma.ministryArea.findMany({
                where: { ministry_id: ministry.id }
            });

            if (activeAreas.length === 0) {
                throw new Error("Nenhuma área cadastrada! Cadastre áreas no painel.");
            }

            const memberUsageCount: Record<string, number> = {};
            members.forEach(m => memberUsageCount[m.name.trim()] = 0);

            const [yearM, monthNumM] = month.split('-').map(Number);
            const dateM = new Date(yearM, monthNumM - 1, 1);
            const servicesM: any[] = [];

            while (dateM.getMonth() === monthNumM - 1) {
                const dayOfWeek = dateM.getDay();
                if (allowedDaysOfWeek.includes(dayOfWeek)) {
                    const rawDate = dateM.toISOString().split('T')[0]!;
                    const actualDate = new Date(rawDate + 'T12:00:00');

                    const tempDate = new Date(rawDate + 'T12:00:00');
                    const diff = tempDate.getDate() - tempDate.getDay();
                    const sundayOfThisWeek = new Date(tempDate.setDate(diff));
                    const weekKey = sundayOfThisWeek.toISOString().split('T')[0]!;

                    servicesM.push({
                        date: actualDate.toLocaleDateString('pt-BR'),
                        rawDate,
                        dayName: dayNamesPt[dayOfWeek] || 'Culto',
                        weekKey
                    });
                }
                dateM.setDate(dateM.getDate() + 1);
            }

            const servicesByWeekM = servicesM.reduce((acc, s) => {
                if (!acc[s.weekKey]) acc[s.weekKey] = [];
                acc[s.weekKey].push(s);
                return acc;
            }, {} as Record<string, any[]>);

            const prevMonthDate = new Date(yearM, monthNumM - 2, 1);
            const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;

            const lastSchedulePrevMonth = await prisma.schedule.findFirst({
                where: {
                    ministry_id: ministry.id,
                    month_reference: prevMonthStr,
                    ...(targetCongregationId ? { congregation_id: targetCongregationId } : {})
                },
                include: {
                    shifts: {
                        orderBy: { shift_date: 'desc' },
                        take: 1,
                        include: { members: { include: { member: true } } }
                    }
                }
            });

            let lastSundayWeekKey = "";
            const lastShift = lastSchedulePrevMonth?.shifts?.[0];
            if (lastShift) {
                const shiftDateObj = new Date(lastShift.shift_date);
                const rawLast = shiftDateObj.toISOString().split('T')[0]!;
                const tempD = new Date(rawLast + 'T12:00:00');

                if (tempD.getDay() === 0 && lastShift.members) {
                    const diff = tempD.getDate() - tempD.getDay();
                    const lastSunday = new Date(tempD.setDate(diff));
                    lastSundayWeekKey = lastSunday.toISOString().split('T')[0]!;
                }
            }

            let isFirstWeek = true;

            Object.entries(servicesByWeekM).forEach(([weekKey, weekServices]: [string, any]) => {
                let weeklyShiftTeam: string[] = [];
                const busyMembers = new Set<string>();

                const isContinuityWeek = isFirstWeek && weekKey === lastSundayWeekKey && !!lastShift && Array.isArray(lastShift.members);
                isFirstWeek = false;

                for (const area of activeAreas) {
                    let assignedCandidateName: string | null = null;

                    if (isContinuityWeek && lastShift) {
                        const carryAssignment = lastShift.members.find((sm: any) =>
                            sm.area_name && sm.area_name.toLowerCase().trim() === area.name.toLowerCase().trim()
                        );
                        if (carryAssignment && carryAssignment.member) {
                            const cName = carryAssignment.member.name.trim();
                            const isMemberActive = carryAssignment.member.is_active && activeMemberNames.has(cName);
                            const hasRestInWeek = weekServices.some((s: any) =>
                                safeRestrictions.some((r: any) => r.member?.trim() === cName && r.date === s.rawDate)
                            );
                            const isBusy = busyMembers.has(cName);

                            if (isMemberActive && !hasRestInWeek && !isBusy) {
                                assignedCandidateName = cName;
                            }
                        }
                    }

                    if (!assignedCandidateName) {
                        const eligibleMembers = members.filter(m =>
                            m.areas.some((a: any) => a.area_id === area.id)
                        );

                        const pool = [...eligibleMembers].sort((a, b) => {
                            const countA = memberUsageCount[a.name.trim()] || 0;
                            const countB = memberUsageCount[b.name.trim()] || 0;
                            if (countA !== countB) return countA - countB;
                            return Math.random() - 0.5;
                        });

                        for (const candidate of pool) {
                            const candidateName = candidate.name.trim();
                            const hasRestrictionInWeek = weekServices.some((s: any) =>
                                safeRestrictions.some((r: any) => r.member?.trim() === candidateName && r.date === s.rawDate)
                            );
                            const isBusyInAnotherArea = busyMembers.has(candidateName);

                            if (!hasRestrictionInWeek && !isBusyInAnotherArea) {
                                assignedCandidateName = candidateName;
                                break;
                            }
                        }
                    }

                    if (assignedCandidateName) {
                        weeklyShiftTeam.push(`${assignedCandidateName} (${area.name})`);
                        busyMembers.add(assignedCandidateName);
                        memberUsageCount[assignedCandidateName] = (memberUsageCount[assignedCandidateName] || 0) + 1;
                    } else {
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
        // MODO 4: AVULSOS OU OUTROS MINISTÉRIOS (Sorteio Simples)
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

                    const candidate = candidateObj.name.trim();
                    const isAvailable = weekServices.every((s: any) =>
                        !safeRestrictions.some((r: any) => r.member?.trim() === candidate && r.date === s.rawDate)
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
                const rawName = match ? (match[1] ?? "").trim() : memberString.trim();
                const areaName = match ? (match[2] ?? "").trim() : null;

                const member = await tx.member.findFirst({
                    where: {
                        ministry_id: ministryId,
                        name: rawName,
                        is_active: true
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
        const ministry = await prisma.ministry.findFirst({ where: { name: { equals: rosterData.ministry, mode: 'insensitive' } } });
        if (!ministry) throw new Error(`Ministério '${rosterData.ministry}' não encontrado.`);

        const membersList = await prisma.member.findMany({
            where: { ministry_id: ministry.id },
            select: { name: true, email: true }
        });
        const memberEmailMap = new Map(membersList.map(m => [m.name.trim(), m.email]));

        const invites = [];
        for (const shift of rosterData.shifts) {
            for (const memberString of shift.team) {
                const match = memberString.match(/^(.*?) \((.*?)\)$/);
                const rawName = match ? (match[1] ?? "").trim() : memberString.trim();
                const email = memberEmailMap.get(rawName);

                if (email && email.trim() !== '') {
                    const emailTitle = `Escala de ${rosterData.month} - ${rosterData.ministry}`;
                    let startTime = "";
                    let endTime = "";

                    if (shift.dayName === 'Domingo') {
                        startTime = "17:00";
                        endTime = "20:00";
                    } else if (shift.dayName === 'Quinta-feira' || shift.dayName === 'Quarta-feira') {
                        startTime = "18:30";
                        endTime = "21:00";
                    }

                    invites.push({
                        member_name: rawName,
                        member_email: email,
                        event_date: shift.date.split('/').reverse().join('-'),
                        start_event_time: startTime,
                        end_event_time: endTime,
                        day_name: shift.dayName,
                        email_title: `${emailTitle} (${shift.dayName})`
                    });
                }
            }
        }

        if (invites.length > 0) {
            await axios.post(process.env.WEBHOOK_URL || '', {
                ministry: rosterData.ministry,
                roster_month: rosterData.month,
                invites: invites
            });
        }
    }
}
