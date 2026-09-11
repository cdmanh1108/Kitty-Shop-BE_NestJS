import { parseLegacyColors } from '../../src/modules/catalog/infrastructure/import/legacy-color.parser';
import {
  normalizeToCode,
  parseLegacyBoolean,
  parseLegacyNumber,
} from '../../src/modules/catalog/infrastructure/import/legacy-catalog.normalizer';

describe('Legacy Color Parser & Normalizer', () => {
  describe('Normalizer utilities', () => {
    it('normalizes Vietnamese text to stable uppercase code', () => {
      expect(normalizeToCode('Đầm ngắn')).toBe('DAM_NGAN');
      expect(normalizeToCode('Bikini')).toBe('BIKINI');
      expect(normalizeToCode('Áo lẻ')).toBe('AO_LE');
      expect(normalizeToCode('Chân váy')).toBe('CHAN_VAY');
      expect(normalizeToCode('Đầm')).toBe('DAM');
      expect(normalizeToCode('Free Size')).toBe('FREE_SIZE');
      expect(normalizeToCode('Xs')).toBe('XS');
      expect(normalizeToCode('Vàng chanh')).toBe('VANG_CHANH');
    });

    it('parses legacy numbers correctly', () => {
      expect(parseLegacyNumber(50000)).toBe(50000);
      expect(parseLegacyNumber('50,000')).toBe(50000);
      expect(parseLegacyNumber('30.000')).toBe(30000);
      expect(parseLegacyNumber('0')).toBe(0);
      expect(parseLegacyNumber(null)).toBeNull();
      expect(parseLegacyNumber(undefined)).toBeNull();
    });

    it('parses legacy boolean active status', () => {
      expect(parseLegacyBoolean('Có')).toBe(true);
      expect(parseLegacyBoolean('CO')).toBe(true);
      expect(parseLegacyBoolean('Ngưng')).toBe(false);
      expect(parseLegacyBoolean('NGUNG')).toBe(false);
      expect(parseLegacyBoolean('unknown')).toBeNull();
    });
  });

  describe('Color Tokenizer & Vocabulary Matching', () => {
    it('parses single-word colors', () => {
      const red = parseLegacyColors('Đỏ');
      expect(red.valid).toBe(true);
      expect(red.isMultiColor).toBe(false);
      expect(red.colors).toEqual([{ name: 'Đỏ', code: 'DO' }]);

      const white = parseLegacyColors('Trắng');
      expect(white.valid).toBe(true);
      expect(white.colors).toEqual([{ name: 'Trắng', code: 'TRANG' }]);

      const black = parseLegacyColors('Đen');
      expect(black.valid).toBe(true);
      expect(black.colors).toEqual([{ name: 'Đen', code: 'DEN' }]);
    });

    it('parses multi-word colors as single color records without splitting words', () => {
      const yellowLemon = parseLegacyColors('Vàng chanh');
      expect(yellowLemon.valid).toBe(true);
      expect(yellowLemon.isMultiColor).toBe(false);
      expect(yellowLemon.colors).toEqual([{ name: 'Vàng chanh', code: 'VANG_CHANH' }]);

      const lightGreen = parseLegacyColors('Xanh lá nhạt');
      expect(lightGreen.valid).toBe(true);
      expect(lightGreen.isMultiColor).toBe(false);
      expect(lightGreen.colors).toEqual([{ name: 'Xanh lá nhạt', code: 'XANH_LA_NHAT' }]);

      const gradient = parseLegacyColors('Loang màu');
      expect(gradient.valid).toBe(true);
      expect(gradient.isMultiColor).toBe(false);
      expect(gradient.colors).toEqual([{ name: 'Loang màu', code: 'LOANG_MAU' }]);

      const green = parseLegacyColors('Xanh lá');
      expect(green.valid).toBe(true);
      expect(green.isMultiColor).toBe(false);
      expect(green.colors).toEqual([{ name: 'Xanh lá', code: 'XANH_LA' }]);
    });

    it('splits delimited multi-colors into separate variants', () => {
      const redWhite = parseLegacyColors('Đỏ, Trắng');
      expect(redWhite.valid).toBe(true);
      expect(redWhite.isMultiColor).toBe(true);
      expect(redWhite.colors).toEqual([
        { name: 'Đỏ', code: 'DO' },
        { name: 'Trắng', code: 'TRANG' },
      ]);

      const whitePink = parseLegacyColors('Trắng, Hồng');
      expect(whitePink.valid).toBe(true);
      expect(whitePink.isMultiColor).toBe(true);
      expect(whitePink.colors).toEqual([
        { name: 'Trắng', code: 'TRANG' },
        { name: 'Hồng', code: 'HONG' },
      ]);
    });

    it('correctly parses undelimited multi-color phrases like "Trắng Hồng" and "Đen trắng"', () => {
      const whitePinkUndelimited = parseLegacyColors('Trắng Hồng');
      expect(whitePinkUndelimited.valid).toBe(true);
      expect(whitePinkUndelimited.isMultiColor).toBe(true);
      expect(whitePinkUndelimited.colors).toEqual([
        { name: 'Trắng', code: 'TRANG' },
        { name: 'Hồng', code: 'HONG' },
      ]);

      const blackWhite = parseLegacyColors('Đen trắng');
      expect(blackWhite.valid).toBe(true);
      expect(blackWhite.isMultiColor).toBe(true);
      expect(blackWhite.colors).toEqual([
        { name: 'Đen', code: 'DEN' },
        { name: 'Trắng', code: 'TRANG' },
      ]);

      const greenWhite = parseLegacyColors('Xanh lá Trắng');
      expect(greenWhite.valid).toBe(true);
      expect(greenWhite.isMultiColor).toBe(true);
      expect(greenWhite.colors).toEqual([
        { name: 'Xanh lá', code: 'XANH_LA' },
        { name: 'Trắng', code: 'TRANG' },
      ]);
    });

    it('rejects numeric color values like 1 as invalid without creating Color master', () => {
      const numColor = parseLegacyColors(1);
      expect(numColor.valid).toBe(false);
      expect(numColor.colors).toEqual([]);
      expect(numColor.warningCode).toBe('INVALID_COLOR_VALUE');

      const numStrColor = parseLegacyColors('1');
      expect(numStrColor.valid).toBe(false);
      expect(numStrColor.colors).toEqual([]);
      expect(numStrColor.warningCode).toBe('INVALID_COLOR_VALUE');
    });

    it('treats blank, null, or undefined as missing color without fallback to "Unknown"', () => {
      const nullColor = parseLegacyColors(null);
      expect(nullColor.valid).toBe(true);
      expect(nullColor.colors).toEqual([]);
      expect(nullColor.warningCode).toBe('MISSING_COLOR');

      const undefinedColor = parseLegacyColors(undefined);
      expect(undefinedColor.valid).toBe(true);
      expect(undefinedColor.colors).toEqual([]);
      expect(undefinedColor.warningCode).toBe('MISSING_COLOR');

      const emptyColor = parseLegacyColors('   ');
      expect(emptyColor.valid).toBe(true);
      expect(emptyColor.colors).toEqual([]);
      expect(emptyColor.warningCode).toBe('MISSING_COLOR');
    });

    it('is deterministic: same input always returns exact same parsed colors', () => {
      const run1 = parseLegacyColors('Trắng, Hồng');
      const run2 = parseLegacyColors('Trắng, Hồng');
      expect(run1).toEqual(run2);
    });
  });
});
