const sampling = require('../../src/services/samplingService');

describe('statisticalSampleSize', () => {
  // Published attribute sampling table values.
  test.each([
    [0.95, 0.05, 0, 59],
    [0.95, 0.05, 0.01, 93],
    [0.90, 0.10, 0, 22],
    [0.90, 0.05, 0, 45],
    [0.95, 0.10, 0.01, 46],
    [0.90, 0.05, 0.01, 77]
  ])('%p confidence, %p tolerable, %p expected -> %p', (confidence, tolerableRate, expectedRate, expected) => {
    expect(sampling.statisticalSampleSize({ confidence, tolerableRate, expectedRate }).sample_size).toBe(expected);
  });

  test('applies the finite population correction', () => {
    const result = sampling.statisticalSampleSize({ confidence: 0.95, tolerableRate: 0.05, population: 200 });
    expect(result.unadjusted_sample_size).toBe(59);
    expect(result.sample_size).toBe(46);
    expect(result.allowed_deviations).toBe(0);
  });

  test('rejects an expected rate at or above the tolerable rate', () => {
    expect(() => sampling.statisticalSampleSize({ tolerableRate: 0.05, expectedRate: 0.05 })).toThrow(RangeError);
  });
});

describe('frequencySampleSize', () => {
  test('uses the risk column of the table', () => {
    expect(sampling.frequencySampleSize({ frequency: 'weekly', riskLevel: 'low' }).sample_size).toBe(5);
    expect(sampling.frequencySampleSize({ frequency: 'weekly', riskLevel: 'high' }).sample_size).toBe(15);
    expect(sampling.frequencySampleSize({ frequency: 'daily', riskLevel: 'moderate' }).sample_size).toBe(30);
  });

  test('caps at the population and tests one automated instance', () => {
    expect(sampling.frequencySampleSize({ frequency: 'daily', riskLevel: 'high', population: 12 }).sample_size).toBe(12);
    expect(sampling.frequencySampleSize({ frequency: 'recurring', controlType: 'automated' }).sample_size).toBe(1);
  });

  test('rejects unknown frequencies', () => {
    expect(() => sampling.frequencySampleSize({ frequency: 'hourly' })).toThrow(RangeError);
  });
});

describe('selectSample', () => {
  test('is reproducible from its seed and returns distinct sorted items', () => {
    const a = sampling.selectSample(1000, 25, 'seed-1');
    expect(a).toEqual(sampling.selectSample(1000, 25, 'seed-1'));
    expect(a).not.toEqual(sampling.selectSample(1000, 25, 'seed-2'));
    expect(new Set(a).size).toBe(25);
    expect([...a].sort((x, y) => x - y)).toEqual(a);
    expect(Math.min(...a)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...a)).toBeLessThanOrEqual(1000);
  });

  test('selects most of a small population without repeats', () => {
    const picks = sampling.selectSample(10, 8, 'x');
    expect(new Set(picks).size).toBe(8);
  });

  test('returns nothing without a population', () => {
    expect(sampling.selectSample(null, 5, 'x')).toEqual([]);
  });
});

describe('suggestConclusion', () => {
  test('no exceptions is effective', () => {
    expect(sampling.suggestConclusion({ exceptions: 0, sampleMethod: 'frequency_table' })).toBe('effective');
  });
  test('any exception in a table sample is ineffective', () => {
    expect(sampling.suggestConclusion({ exceptions: 1, sampleMethod: 'frequency_table' })).toBe('ineffective');
  });
  test('statistical samples tolerate the planned deviations', () => {
    expect(sampling.suggestConclusion({ exceptions: 1, sampleMethod: 'statistical', allowedDeviations: 1 })).toBe('effective_with_exceptions');
    expect(sampling.suggestConclusion({ exceptions: 2, sampleMethod: 'statistical', allowedDeviations: 1 })).toBe('ineffective');
  });
});
