// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- INÍCIO DA CORREÇÃO PARA ES MODULES ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// --- FIM DA CORREÇÃO ---

const prisma = new PrismaClient();

async function main() {
  console.log('⏳ Lendo o arquivo JSON do Firebase...');
  
  // Lê o arquivo JSON da raiz do projeto
  const rawData = fs.readFileSync(path.resolve(__dirname, './firebase-data.json'), 'utf-8');
  const data = JSON.parse(rawData);
  const firebaseMembers = data.members || {};
  const firebaseRosters = data.rosters || {};

  // ==========================================
  // ETAPA 1: CRIAR MINISTÉRIOS
  // ==========================================
  console.log('🔄 Extraindo ministérios únicos...');
  const ministryNames = new Set<string>();
  
  Object.values(firebaseMembers).forEach((m: any) => ministryNames.add(m.ministry));
  Object.values(firebaseRosters).forEach((r: any) => ministryNames.add(r.ministry));

  const ministryMap = new Map<string, number>();

  for (const name of ministryNames) {
    if (!name) continue;
    // O upsert garante que não crie duplicado caso você rode o script duas vezes
    const ministry = await prisma.ministry.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    ministryMap.set(name, ministry.id);
  }
  console.log(`✅ ${ministryMap.size} Ministérios criados/validados no banco.`);

  // ==========================================
  // ETAPA 2: IMPORTAR MEMBROS
  // ==========================================
  console.log('🔄 Importando membros...');
  const memberMap = new Map<string, string>(); // Mapeia "Nome da Pessoa" -> "ID do Postgres"

  for (const firebaseId of Object.keys(firebaseMembers)) {
    const m = firebaseMembers[firebaseId];
    const ministryId = ministryMap.get(m.ministry);

    const member = await prisma.member.create({
      data: {
        name: m.name,
        phone: m.phone || null,
        ministry_id: ministryId,
        created_at: m.createdAt ? new Date(m.createdAt) : new Date(),
      }
    });
    // Guarda no mapa (ex: "Larissa " -> "uuid-1234") para linkar na escala depois
    memberMap.set(m.name, member.id);
  }
  console.log(`✅ ${memberMap.size} Membros importados.`);

  // ==========================================
  // ETAPA 3: IMPORTAR ESCALAS E TURNOS
  // ==========================================
  console.log('🔄 Importando escalas e turnos...');
  let schedulesCount = 0;
  let shiftsCount = 0;

  for (const firebaseId of Object.keys(firebaseRosters)) {
    const r = firebaseRosters[firebaseId];
    const ministryId = ministryMap.get(r.ministry);

    // 3.1 Cria a Escala (Schedule) principal do mês
    const schedule = await prisma.schedule.create({
      data: {
        month_reference: r.month,
        ministry_id: ministryId,
        created_at: r.createdAt ? new Date(r.createdAt) : new Date(),
      }
    });
    schedulesCount++;

    // 3.2 Percorre os dias (Shifts) dessa escala
    if (r.shifts && Array.isArray(r.shifts)) {
      for (const s of r.shifts) {
        
        // Converte a data do Firebase (DD/MM/YYYY) para ISO do Postgres
        const [day, month, year] = s.date.split('/');
        const shiftDate = new Date(`${year}-${month}-${day}T12:00:00Z`);

        const shift = await prisma.shift.create({
          data: {
            schedule_id: schedule.id,
            shift_date: shiftDate,
            day_name: s.dayName,
          }
        });
        shiftsCount++;

        // 3.3 Conecta os membros à escala do dia usando o mapa de Nomes -> IDs
        if (s.team && Array.isArray(s.team)) {
          for (const memberName of s.team) {
            const memberId = memberMap.get(memberName);
            
            if (memberId) {
              await prisma.shiftAssignment.create({
                data: {
                  shift_id: shift.id,
                  member_id: memberId
                }
              });
            } else {
              console.warn(`⚠️ Aviso: Membro '${memberName}' não cadastrado. Ignorado no turno ${s.date}.`);
            }
          }
        }
      }
    }
  }
  
  console.log(`✅ ${schedulesCount} Escalas importadas com um total de ${shiftsCount} turnos.`);
  console.log('🎉 MIGRAÇÃO CONCLUÍDA COM SUCESSO! O Postgres está atualizado.');
}

main()
  .catch((e) => {
    console.error('❌ ERRO NA MIGRAÇÃO:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });