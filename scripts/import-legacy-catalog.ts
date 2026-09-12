import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { LegacyCatalogImportModule } from '../src/cli/legacy-catalog/legacy-catalog-import.module';
import { LegacyCatalogImportService } from '../src/cli/legacy-catalog/legacy-catalog-import.service';
import type { LegacyImportReport } from '../src/cli/legacy-catalog/legacy-catalog-import.types';

interface CliArgs {
  file: string;
  shop: string;
  dryRun: boolean;
  apply: boolean;
}

function parseCliArgs(argv: string[]): CliArgs {
  let file = '';
  let shop = process.env.DEFAULT_SHOP_CODE ?? 'MAIN';
  let apply = false;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--file' && argv[i + 1]) {
      file = argv[i + 1]!;
      i++;
    } else if (arg === '--shop' && argv[i + 1]) {
      shop = argv[i + 1]!;
      i++;
    } else if (arg === '--apply') {
      apply = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    }
  }

  // Safety-first: default to dry-run unless --apply is explicitly passed without --dry-run
  if (!apply) {
    dryRun = true;
  }

  if (!file) throw new Error('Cần cung cấp --file với đường dẫn cụ thể đến tệp Excel.');
  return { file, shop, dryRun, apply: apply && !dryRun };
}

function printReport(report: LegacyImportReport): void {
  const divider =
    '================================================================================';
  const subDivider =
    '--------------------------------------------------------------------------------';

  console.log('\n' + divider);
  console.log(`  LEGACY CATALOG IMPORT REPORT [${report.mode}]`);
  console.log(divider);
  console.log(`  File:     ${report.filePath}`);
  console.log(`  Shop:     ${report.shopCode} (${report.shopId})`);
  console.log(`  Mode:     ${report.mode}`);
  console.log(`  Duration: ${report.durationMs}ms`);
  console.log(`  Status:   ${report.success ? 'SUCCESS' : 'FAILED'}`);

  console.log('\n' + subDivider);
  console.log('  1. SOURCE RECONCILIATION');
  console.log(subDivider);
  const r = report.reconciliation;
  console.log(`  - Parsed Products:           ${r.totalProductRows}`);
  console.log(`  - Unique Product Codes:      ${r.uniqueProductCodes}`);
  console.log(`  - Legacy Total Quantity:     ${r.legacyQuantitySum}`);
  console.log(`  - Rental Price 50,000 VND:   ${r.price50kCount}`);
  console.log(`  - Rental Price 30,000 VND:   ${r.price30kCount}`);
  if (r.otherPriceCount > 0) {
    console.log(`  - Other Rental Prices:       ${r.otherPriceCount}`);
  }
  console.log(`  - Deposit 200,000 VND:       ${r.deposit200kCount}`);
  console.log(`  - Deposit 0 VND:             ${r.deposit0Count}`);
  if (r.otherDepositCount > 0) {
    console.log(`  - Other Deposits:            ${r.otherDepositCount}`);
  }
  console.log(`  - Image URL Coverage:        ${r.imageUrlCount} / ${r.totalProductRows}`);
  console.log(`  - Active Products ("Có"):    ${r.activeCount} / ${r.totalProductRows}`);

  console.log('\n' + subDivider);
  console.log('  2. INVENTORY RECONCILIATION');
  console.log(subDivider);
  const inv = report.inventory;
  console.log(`  - Legacy Total Quantity:     ${inv.legacyTotalQuantity}`);
  console.log(`  - Imported Physical Items:   ${inv.importedPhysicalCount}`);
  console.log(`  - Unallocated Physical Items: ${inv.unallocatedPhysicalCount}`);
  console.log(`  - Difference:                ${inv.difference} (Must be 0)`);
  if (inv.unallocatedItems.length > 0) {
    console.log('\n  Unallocated Items Detail (Multi-color Qty=1 ambiguity):');
    for (const item of inv.unallocatedItems) {
      console.log(
        `    * [${item.productCode}] "${item.productName}": Qty=${item.quantity}, Variants=[${item.variants.join(', ')}]`,
      );
    }
  }

  console.log('\n' + subDivider);
  console.log(`  3. DATABASE MUTATIONS (${report.mode === 'DRY_RUN' ? 'PLANNED' : 'EXECUTED'})`);
  console.log(subDivider);
  const m = report.mutations;
  console.log(
    `  - Categories:     +${m.categoriesCreated} created, ${m.categoriesExisting} existing`,
  );
  console.log(`  - Sizes:          +${m.sizesCreated} created, ${m.sizesExisting} existing`);
  console.log(`  - Colors:         +${m.colorsCreated} created, ${m.colorsExisting} existing`);
  console.log(
    `  - Products:       +${m.productsCreated} created, ${m.productsUnchanged} unchanged, ${m.productsConflicted} conflicted`,
  );
  console.log(
    `  - Variants:       +${m.variantsCreated} created, ${m.variantsUnchanged} unchanged`,
  );
  console.log(
    `  - Rental Rates:   +${m.rentalRatesCreated} created, ${m.rentalRatesUnchanged} unchanged`,
  );
  console.log(`  - Product Media:  +${m.mediaCreated} created, ${m.mediaUnchanged} unchanged`);
  console.log(
    `  - Inventory Items:+${m.inventoryItemsCreated} created, ${m.inventoryItemsUnchanged} unchanged`,
  );

  console.log('\n' + subDivider);
  console.log('  4. VALIDATION & ANOMALIES');
  console.log(subDivider);
  const v = report.validation;
  console.log(`  - Fatal Errors:     ${v.fatalCount}`);
  console.log(`  - Errors:           ${v.errorCount}`);
  console.log(`  - Warnings:         ${v.warningCount}`);
  console.log(`  - Review Required:  ${v.reviewRequiredCount}`);

  if (report.issues.length > 0) {
    console.log('\n  Notable Issues / Warnings:');
    for (const issue of report.issues) {
      if (issue.severity !== 'INFO') {
        const pCode = issue.productCode ? `[${issue.productCode}] ` : '';
        console.log(
          `    [${issue.severity}] ${issue.code} at Row ${issue.row}: ${pCode}${issue.message}`,
        );
      }
    }
  }

  console.log('\n' + divider + '\n');
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));
  const resolvedPath = path.resolve(process.cwd(), args.file);

  console.log(`Starting Legacy Catalog Import...`);
  console.log(`Target File: ${resolvedPath}`);
  console.log(`Shop Code:   ${args.shop}`);
  console.log(`Mode:        ${args.apply ? 'APPLY (Mutating DB)' : 'DRY RUN (Read Only)'}`);

  const app = await NestFactory.createApplicationContext(LegacyCatalogImportModule, {
    logger: ['error', 'warn'],
  });

  try {
    const importService = app.get(LegacyCatalogImportService);
    const report = await importService.execute({
      filePath: resolvedPath,
      shopCode: args.shop,
      dryRun: args.dryRun,
      apply: args.apply,
    });

    printReport(report);

    if (!report.success) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('\nIMPORT EXECUTION FAILED:', error);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

if (require.main === module)
  void main().catch(() => {
    console.error('Legacy import failed. Check arguments and configuration.');
    process.exitCode = 1;
  });
