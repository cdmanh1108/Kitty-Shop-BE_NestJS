import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  CreateProductReqDto,
  UpdateProductReqDto,
} from '../../src/modules/catalog/api/admin/dto/product.dto';

describe.each([CreateProductReqDto, UpdateProductReqDto])(
  'Product free accessory limit input',
  (Dto) => {
    it.each([undefined, 0, 1, 3, 2147483647])(
      'accepts an omitted or nonnegative integer limit %s',
      (value) => {
        const errors = validateSync(
          plainToInstance<object, { freeAccessoryLimit: unknown }>(Dto, {
            freeAccessoryLimit: value,
          }),
        );
        expect(errors.find((error) => error.property === 'freeAccessoryLimit')).toBeUndefined();
      },
    );
    it.each([null, -1, 1.5, '2', 2147483648])('rejects an invalid limit %s', (value) => {
      const errors = validateSync(
        plainToInstance<object, { freeAccessoryLimit: unknown }>(Dto, {
          freeAccessoryLimit: value,
        }),
      );
      expect(errors.find((error) => error.property === 'freeAccessoryLimit')).toBeDefined();
    });
  },
);
