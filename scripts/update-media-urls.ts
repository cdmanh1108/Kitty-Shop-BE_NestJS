import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';

config();

const prisma = new PrismaClient();

async function main() {
  const baseUrl = (
    process.env.OBJECT_STORAGE_PUBLIC_BASE_URL ||
    'https://pub-da9772f41ace4dda9871f112ae659353.r2.dev'
  )
    .trim()
    .replace(/\/+$/, '');

  const rows = await prisma.productMedia.findMany({
    where: { storageKey: { not: null } },
  });

  console.log(`Found ${rows.length} media rows with storageKey.`);
  let updatedCount = 0;

  for (const row of rows) {
    if (!row.storageKey) continue;
    const cleanKey = row.storageKey.trim().replace(/^\/+/, '');
    const expectedUrl = `${baseUrl}/${cleanKey}`;
    if (row.url !== expectedUrl) {
      await prisma.productMedia.update({
        where: { id: row.id },
        data: { url: expectedUrl },
      });
      updatedCount++;
    }
  }

  console.log(`Updated ${updatedCount} rows with Cloudflare R2 URL.`);

  const allRows = await prisma.productMedia.findMany({
    select: { id: true, storageKey: true, url: true },
  });
  console.log(`Total media rows: ${allRows.length}`);
  const withoutStorageKey = allRows.filter((r) => !r.storageKey);
  console.log(`Rows without storageKey: ${withoutStorageKey.length}`);
  const remainingDrive = allRows.filter((r) => r.url.includes('google.com'));
  console.log(`Rows with Google Drive URL: ${remainingDrive.length}`);
  const r2Rows = allRows.filter((r) => r.url.includes('r2.dev'));
  console.log(`Rows with Cloudflare R2 URL: ${r2Rows.length}`);
  console.log('Sample row:', allRows[0]);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
