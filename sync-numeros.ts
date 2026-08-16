import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando a sincronização dos números das fichas antigas...');

  // Dados extraídos do PDF original
  const fichas = [
    // FICHAS AMARELAS
    { tokenType: 'AMARELA', tokenNumber: 1, shortCode: 'GCUEN' },
    { tokenType: 'AMARELA', tokenNumber: 2, shortCode: '6PU95' },
    { tokenType: 'AMARELA', tokenNumber: 3, shortCode: 'RGRH8' },
    { tokenType: 'AMARELA', tokenNumber: 4, shortCode: 'XF2J9' },
    { tokenType: 'AMARELA', tokenNumber: 5, shortCode: 'TXD3Q' },
    { tokenType: 'AMARELA', tokenNumber: 6, shortCode: 'CFVV4' },
    { tokenType: 'AMARELA', tokenNumber: 7, shortCode: 'R8F5A' },
    { tokenType: 'AMARELA', tokenNumber: 8, shortCode: 'ZVCDG' },
    { tokenType: 'AMARELA', tokenNumber: 9, shortCode: '9BLV2' },
    { tokenType: 'AMARELA', tokenNumber: 10, shortCode: 'MSJHK' },
    { tokenType: 'AMARELA', tokenNumber: 11, shortCode: 'MM7WY' },
    { tokenType: 'AMARELA', tokenNumber: 12, shortCode: 'S9HGN' },
    { tokenType: 'AMARELA', tokenNumber: 13, shortCode: 'E2R7Q' },
    { tokenType: 'AMARELA', tokenNumber: 14, shortCode: 'VNYVR' },
    { tokenType: 'AMARELA', tokenNumber: 15, shortCode: '3SBZQ' },
    { tokenType: 'AMARELA', tokenNumber: 16, shortCode: 'M8QT3' },
    { tokenType: 'AMARELA', tokenNumber: 17, shortCode: 'LBS75' },
    { tokenType: 'AMARELA', tokenNumber: 18, shortCode: '9D68K' },
    { tokenType: 'AMARELA', tokenNumber: 19, shortCode: 'GXFYX' },
    { tokenType: 'AMARELA', tokenNumber: 20, shortCode: '9KGEG' },
    { tokenType: 'AMARELA', tokenNumber: 21, shortCode: 'JMGJF' },
    { tokenType: 'AMARELA', tokenNumber: 22, shortCode: 'EB42C' },
    { tokenType: 'AMARELA', tokenNumber: 23, shortCode: 'L2RBL' },
    { tokenType: 'AMARELA', tokenNumber: 24, shortCode: 'S78X2' },
    { tokenType: 'AMARELA', tokenNumber: 25, shortCode: 'B5288' },
    { tokenType: 'AMARELA', tokenNumber: 26, shortCode: 'ZRNDL' },
    { tokenType: 'AMARELA', tokenNumber: 27, shortCode: '3C8GH' },
    { tokenType: 'AMARELA', tokenNumber: 28, shortCode: 'NXJ23' },
    { tokenType: 'AMARELA', tokenNumber: 29, shortCode: 'DRDTX' },
    { tokenType: 'AMARELA', tokenNumber: 30, shortCode: 'P5ADU' },
    { tokenType: 'AMARELA', tokenNumber: 31, shortCode: 'TRQJP' },
    { tokenType: 'AMARELA', tokenNumber: 32, shortCode: '9EQFG' },
    { tokenType: 'AMARELA', tokenNumber: 33, shortCode: '9EGJD' },
    { tokenType: 'AMARELA', tokenNumber: 34, shortCode: 'TWFR9' },
    { tokenType: 'AMARELA', tokenNumber: 35, shortCode: 'NK4AN' },
    { tokenType: 'AMARELA', tokenNumber: 36, shortCode: 'KULFJ' },
    { tokenType: 'AMARELA', tokenNumber: 37, shortCode: 'R9LVR' },
    { tokenType: 'AMARELA', tokenNumber: 38, shortCode: '5DEFE' },
    { tokenType: 'AMARELA', tokenNumber: 39, shortCode: 'VFD8C' },
    { tokenType: 'AMARELA', tokenNumber: 40, shortCode: 'LMXTE' },

    // FICHAS VERDES
    { tokenType: 'VERDE', tokenNumber: 1, shortCode: 'VTPWD' },
    { tokenType: 'VERDE', tokenNumber: 2, shortCode: 'PKW9K' },
    { tokenType: 'VERDE', tokenNumber: 3, shortCode: 'CUHQG' },
    { tokenType: 'VERDE', tokenNumber: 4, shortCode: 'YD5UG' },
    { tokenType: 'VERDE', tokenNumber: 5, shortCode: '4RTQC' },
    { tokenType: 'VERDE', tokenNumber: 6, shortCode: 'T9RXC' },
    { tokenType: 'VERDE', tokenNumber: 7, shortCode: 'KJN8S' },
    { tokenType: 'VERDE', tokenNumber: 8, shortCode: 'KPR4J' },
    { tokenType: 'VERDE', tokenNumber: 9, shortCode: 'FPSNS' },
    { tokenType: 'VERDE', tokenNumber: 10, shortCode: 'J8WHX' },
    { tokenType: 'VERDE', tokenNumber: 11, shortCode: 'FK7BN' },
    { tokenType: 'VERDE', tokenNumber: 12, shortCode: 'ZC9GZ' },
    { tokenType: 'VERDE', tokenNumber: 13, shortCode: '5DLG7' },
    { tokenType: 'VERDE', tokenNumber: 14, shortCode: 'TV3PQ' },
    { tokenType: 'VERDE', tokenNumber: 15, shortCode: '8DL8K' },
    { tokenType: 'VERDE', tokenNumber: 16, shortCode: 'PJ9TD' },
    { tokenType: 'VERDE', tokenNumber: 17, shortCode: 'WTZMQ' },
    { tokenType: 'VERDE', tokenNumber: 18, shortCode: 'HNAGA' },
    { tokenType: 'VERDE', tokenNumber: 19, shortCode: 'BF2FX' },
    { tokenType: 'VERDE', tokenNumber: 20, shortCode: 'Q58B2' },
    { tokenType: 'VERDE', tokenNumber: 21, shortCode: 'E2T59' },
    { tokenType: 'VERDE', tokenNumber: 22, shortCode: 'RBMUP' },
    { tokenType: 'VERDE', tokenNumber: 23, shortCode: '549WM' },
    { tokenType: 'VERDE', tokenNumber: 24, shortCode: 'YDJVF' },
    { tokenType: 'VERDE', tokenNumber: 25, shortCode: '8CM55' },
    { tokenType: 'VERDE', tokenNumber: 26, shortCode: 'UX3E8' },
    { tokenType: 'VERDE', tokenNumber: 27, shortCode: 'GWJJC' },
    { tokenType: 'VERDE', tokenNumber: 28, shortCode: 'DPBEJ' },
    { tokenType: 'VERDE', tokenNumber: 29, shortCode: 'HPH4J' },
    { tokenType: 'VERDE', tokenNumber: 30, shortCode: 'T5NNN' },
    { tokenType: 'VERDE', tokenNumber: 31, shortCode: 'HXVSV' },
    { tokenType: 'VERDE', tokenNumber: 32, shortCode: 'RVH7T' },
    { tokenType: 'VERDE', tokenNumber: 33, shortCode: 'S3DSR' },
    { tokenType: 'VERDE', tokenNumber: 34, shortCode: 'V9VB9' },
    { tokenType: 'VERDE', tokenNumber: 35, shortCode: '8VZCS' },
    { tokenType: 'VERDE', tokenNumber: 36, shortCode: 'UBAEJ' },
    { tokenType: 'VERDE', tokenNumber: 37, shortCode: '2M626' },
    { tokenType: 'VERDE', tokenNumber: 38, shortCode: 'N7K4D' },
    { tokenType: 'VERDE', tokenNumber: 39, shortCode: 'EJ4Q3' },
    { tokenType: 'VERDE', tokenNumber: 40, shortCode: 'BKC7U' }
  ];

  let atualizados = 0;
  let erros = 0;

  // Processa as atualizações uma por uma
  for (const ficha of fichas) {
    try {
      await prisma.ecdToken.update({
        where: { shortCode: ficha.shortCode },
        data: { tokenNumber: ficha.tokenNumber }
      });
      atualizados++;
      console.log(`Progresso: ${atualizados}/${fichas.length} fichas sincronizadas.`);
    } catch (error) {
      console.log(`\n❌ Erro ao atualizar a ficha ${ficha.tokenType} Nº ${ficha.tokenNumber} (ID: ${ficha.shortCode})`);
      erros++;
    }
  }

  console.log('\n\n✅ Sincronização concluída!');
  console.log(`Total de fichas atualizadas: ${atualizados}`);
  if (erros > 0) console.log(`Total de erros: ${erros}`);
}

main()
  .catch((e) => {
    console.error('\nErro fatal na execução:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });