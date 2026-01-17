import { describe, it, expect } from 'vitest';
import { normalizeHex, hexToHsva, hsvaToHex } from '../colorUtils';

describe('colorUtils', () => {
  describe('normalizeHex', () => {
    it('should expand 3-digit hex to 6-digit', () => {
      expect(normalizeHex('03F')).toBe('0033FF');
      expect(normalizeHex('ABC')).toBe('AABBCC');
      expect(normalizeHex('000')).toBe('000000');
      expect(normalizeHex('FFF')).toBe('FFFFFF');
    });

    it('should handle # prefix', () => {
      expect(normalizeHex('#03F')).toBe('0033FF');
      expect(normalizeHex('#ABC')).toBe('AABBCC');
    });

    it('should keep 6-digit hex unchanged', () => {
      expect(normalizeHex('0033FF')).toBe('0033FF');
      expect(normalizeHex('AABBCC')).toBe('AABBCC');
      expect(normalizeHex('#FF0000')).toBe('FF0000');
    });
  });

  describe('hexToHsva', () => {
    it('should convert red correctly', () => {
      const result = hexToHsva('#FF0000');
      expect(result.h).toBe(0);
      expect(result.s).toBe(100);
      expect(result.v).toBe(100);
      expect(result.a).toBe(1);
    });

    it('should convert green correctly', () => {
      const result = hexToHsva('#00FF00');
      expect(result.h).toBe(120);
      expect(result.s).toBe(100);
      expect(result.v).toBe(100);
    });

    it('should convert blue correctly', () => {
      const result = hexToHsva('#0000FF');
      expect(result.h).toBe(240);
      expect(result.s).toBe(100);
      expect(result.v).toBe(100);
    });

    it('should convert white correctly', () => {
      const result = hexToHsva('#FFFFFF');
      expect(result.h).toBe(0);
      expect(result.s).toBe(0);
      expect(result.v).toBe(100);
    });

    it('should convert black correctly', () => {
      const result = hexToHsva('#000000');
      expect(result.h).toBe(0);
      expect(result.s).toBe(0);
      expect(result.v).toBe(0);
    });

    it('should handle gray correctly', () => {
      const result = hexToHsva('#808080');
      expect(result.h).toBe(0);
      expect(result.s).toBe(0);
      expect(Math.round(result.v)).toBeCloseTo(50, 0);
    });
  });

  describe('hsvaToHex', () => {
    it('should convert red correctly', () => {
      expect(hsvaToHex({ h: 0, s: 100, v: 100 })).toBe('#FF0000');
    });

    it('should convert green correctly', () => {
      expect(hsvaToHex({ h: 120, s: 100, v: 100 })).toBe('#00FF00');
    });

    it('should convert blue correctly', () => {
      expect(hsvaToHex({ h: 240, s: 100, v: 100 })).toBe('#0000FF');
    });

    it('should convert white correctly', () => {
      expect(hsvaToHex({ h: 0, s: 0, v: 100 })).toBe('#FFFFFF');
    });

    it('should convert black correctly', () => {
      expect(hsvaToHex({ h: 0, s: 0, v: 0 })).toBe('#000000');
    });

    it('should handle yellow correctly', () => {
      expect(hsvaToHex({ h: 60, s: 100, v: 100 })).toBe('#FFFF00');
    });

    it('should handle cyan correctly', () => {
      expect(hsvaToHex({ h: 180, s: 100, v: 100 })).toBe('#00FFFF');
    });

    it('should handle magenta correctly', () => {
      expect(hsvaToHex({ h: 300, s: 100, v: 100 })).toBe('#FF00FF');
    });
  });

  describe('roundtrip conversion', () => {
    it('should preserve colors through hex -> hsva -> hex', () => {
      const testColors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF'];

      for (const hex of testColors) {
        const hsva = hexToHsva(hex);
        const result = hsvaToHex(hsva);
        expect(result).toBe(hex);
      }
    });
  });
});
