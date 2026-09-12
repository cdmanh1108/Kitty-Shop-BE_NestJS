import { mkdtempSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as XLSX from 'xlsx';

/** Synthetic source only; no private workbook is required to run regression tests. */
export function createLegacyWorkbookFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'kitty-legacy-fixture-'));
  const filePath = join(directory, 'synthetic.xlsx');
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      [
        'Mã sản phẩm',
        'Tên sản phẩm',
        'Nhóm sản phẩm',
        'Size',
        'Màu',
        'Số lượng tổng',
        'Giá thuê mặc định',
        'Tiền cọc mặc định',
        'Trạng thái hoạt động',
        'Ảnh vuông URL',
      ],
      [
        'SP001',
        'Synthetic red dress',
        'Váy',
        'M',
        'Đỏ',
        1,
        50000,
        200000,
        'Có',
        'https://example.com/synthetic.jpg',
      ],
    ]),
    'Sản phẩm',
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['Nhóm sản phẩm', 'Size'],
      ['Váy', 'M'],
    ]),
    'Danh mục',
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['Khóa', 'Giá trị'],
      ['Tiền tệ', 'VND'],
    ]),
    'Cài đặt',
  );
  XLSX.writeFile(workbook, filePath);
  return {
    filePath,
    cleanup: () => {
      unlinkSync(filePath);
      rmdirSync(directory);
    },
  };
}
