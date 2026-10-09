import { describe, expect, it } from 'vitest';
import { COUNTRIES } from '../../services/api/src/_shared/countries';
import { summarizeCountry } from '../../services/api/src/handlers/country-weather';

describe('country monitoring scope and missing data', () => {
  it('has 54 unique countries with named point locations', () => {
    expect(COUNTRIES).toHaveLength(54);
    expect(new Set(COUNTRIES.map(c => c.code)).size).toBe(54);
    expect(COUNTRIES.every(c => c.location && Number.isFinite(c.lat) && Number.isFinite(c.lon))).toBe(true);
  });
  it('does not turn a missing rainfall day into zero or a complete forecast', () => {
    const result = summarizeCountry({ daily: { time: Array(7).fill('2026-10-09'), precipitation_sum: [1, 2, null, 4, 5, 6, 7] } }, 25);
    expect(result.available).toBe(false);
    expect(result).not.toHaveProperty('rainfall_7d_mm');
  });
  it('keeps country, monitoring point, dates and rainfall together', () => {
    const time = ['2026-10-09','2026-10-10','2026-10-11','2026-10-12','2026-10-13','2026-10-14','2026-10-15'];
    expect(summarizeCountry({ daily: { time, precipitation_sum: [1, 2, 30, 4, 5, 6, 7] } }, 25)).toMatchObject({
      country: 'Kenya', location: 'Nairobi', rainfall_7d_mm: 55, peak_date: '2026-10-11', peak_24h_mm: 30, from: time[0], to: time[6],
    });
  });
});
