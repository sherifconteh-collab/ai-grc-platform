'use strict';

// DISA STIG import (#566 Wave 4): XCCDF parsing against a real DISA benchmark
// excerpt, CCI -> NIST SP 800-53 Rev 5 reduction, and the crosswalk writer.

const fs = require('fs');
const path = require('path');
const { parseBenchmark, dedupeControls } = require('../../scripts/lib/stig/xccdf');
const { toControlId } = require('../../scripts/lib/stig/cci');
const CCI = require('../../scripts/lib/frameworks/cci_nist_rev5');
const { insertCciCrosswalks } = require('../../scripts/lib/frameworks/stigSeedHelpers');

const FIXTURE = fs.readFileSync(path.join(__dirname, '../fixtures/disa-stig-rhel8-excerpt-xccdf.xml'), 'utf8');

describe('CCI to 800-53 control ids', () => {
  it('reduces statement-level indexes to the control or enhancement', () => {
    expect(toControlId('AC-2 a')).toBe('AC-2');
    expect(toControlId('AC-2 (3) (d)')).toBe('AC-2(3)');
    expect(toControlId('IA-5 (1) (c)')).toBe('IA-5(1)');
    expect(toControlId('not a reference')).toBeNull();
  });

  it('ships DISA\'s CCI list mapped to Rev 5 ids the catalog knows', () => {
    const catalog = new Set(require('../../scripts/lib/frameworks/nist_800_53').controls.map((c) => c.control_id));
    const targets = new Set(Object.values(CCI.rev5).flat());
    const unknown = [...targets].filter((id) => !catalog.has(id));
    expect(CCI.version).toBe('2023-06-07');
    expect(Object.keys(CCI.rev5).length).toBeGreaterThan(3000);
    // SI-7(13) is cited by DISA but withdrawn in Rev 5; the crosswalk skips it.
    expect(unknown).toEqual(['SI-7(13)']);
  });
});

describe('XCCDF benchmark parsing', () => {
  let bench;
  beforeAll(async () => { bench = await parseBenchmark(FIXTURE, CCI.rev5); });

  it('reads the benchmark metadata', () => {
    expect(bench.title).toBe('Red Hat Enterprise Linux 8 Security Technical Implementation Guide');
    expect(bench.version).toBe('001.002');
    expect(bench.release_info).toMatch(/^Release: 1\.2/);
  });

  it('turns each rule into a control keyed by its STIG id', () => {
    expect(bench.controls.map((c) => c.control_id)).toEqual(['RHEL-08-010000', 'RHEL-08-010110', expect.stringMatching(/^RHEL-08-/)]);
    const first = bench.controls[0];
    expect(first).toMatchObject({
      title: 'RHEL 8 must be a vendor-supported release.',
      priority: '1',
      severity: 'high',
      vuln_id: 'V-230221',
      rule_id: 'SV-230221r743913_rule',
      ccis: ['CCI-000366'],
      nist_800_53: ['CM-6']
    });
    expect(first.description).toMatch(/^An operating system release is considered "supported"/);
    expect(first.description).not.toMatch(/VulnDiscussion/);
  });

  it('reports CCIs with no Rev 5 reference instead of guessing one', () => {
    const unmapped = bench.controls.find((c) => c.ccis.includes('CCI-000196'));
    expect(unmapped.nist_800_53).toEqual([]);
    expect(bench.unmapped_ccis).toContain('CCI-000196');
  });
});

describe('insertCciCrosswalks', () => {
  it('writes related (never equivalent) mappings and skips unknown targets', async () => {
    const calls = [];
    const client = {
      query: jest.fn(async (sql, params) => {
        calls.push({ sql, params });
        if (/f\.code = 'nist_800_53'/.test(sql)) return { rows: [{ id: 'n-cm6', control_id: 'CM-6' }] };
        if (/WHERE framework_id = \$1/.test(sql)) return { rows: [{ id: 's-1', control_id: 'RHEL-08-010000' }] };
        return { rowCount: 1, rows: [] };
      })
    };
    const result = await insertCciCrosswalks(client, 'fw-1', [
      { control_id: 'RHEL-08-010000', nist_800_53: ['CM-6', 'SI-7(13)'] }
    ]);
    expect(result).toEqual({ inserted: 1, missing: ['SI-7(13)'] });
    const insert = calls.find((c) => /INSERT INTO control_mappings/.test(c.sql));
    expect(insert.sql).toMatch(/'related'/);
    expect(insert.params).toEqual(['s-1', 'n-cm6']);
  });
});

describe('repeated requirement ids', () => {
  it('keeps the newest rule when an SRG ships two rules under one id', () => {
    const { controls, dropped } = dedupeControls([
      { control_id: 'SRG-OS-000132-GPOS-00067', vuln_id: 'V-203655' },
      { control_id: 'SRG-OS-000001-GPOS-00001', vuln_id: 'V-203600' },
      { control_id: 'SRG-OS-000132-GPOS-00067', vuln_id: 'V-278973' }
    ]);
    expect(controls.map((c) => c.vuln_id).sort()).toEqual(['V-203600', 'V-278973']);
    expect(dropped).toEqual([{ control_id: 'SRG-OS-000132-GPOS-00067', vuln_id: 'V-203655' }]);
  });

  it('keeps the first rule when a later one is older', () => {
    const { controls, dropped } = dedupeControls([
      { control_id: 'X', vuln_id: 'V-300' },
      { control_id: 'X', vuln_id: 'V-100' }
    ]);
    expect(controls).toEqual([{ control_id: 'X', vuln_id: 'V-300' }]);
    expect(dropped).toEqual([{ control_id: 'X', vuln_id: 'V-100' }]);
  });
});

describe('sunset benchmarks', () => {
  it('flags the retired WebLogic 12c benchmark so it is never read as current', () => {
    const fw = require('../../scripts/lib/frameworks/supplemental/disa_stig_weblogic_12c');
    expect(fw.source.sunset).toBe(true);
    expect(fw.description).toMatch(/^SUNSET:/);
  });

  it('does not flag the current benchmarks', () => {
    for (const code of ['disa_stig_oracle_db_19c', 'disa_stig_oracle_linux_9', 'disa_stig_app']) {
      const fw = require(`../../scripts/lib/frameworks/supplemental/${code}`);
      expect(fw.source.sunset).toBeUndefined();
      expect(fw.description).not.toMatch(/^SUNSET:/);
    }
  });
});

describe('imported DISA benchmark modules', () => {
  const dir = path.join(__dirname, '../../scripts/lib/frameworks/supplemental');
  const modules = fs.readdirSync(dir).filter((f) => /^disa_stig_.*\.js$/.test(f));

  it('finds the eight DISA modules', () => {
    expect(modules.length).toBe(8);
  });

  it.each(modules)('%s has one control per id and crosswalks to 800-53 ids', (file) => {
    const fw = require(path.join(dir, file));
    const ids = fw.controls.map((c) => c.control_id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(fw.controls.length).toBeGreaterThan(0);
    for (const c of fw.controls) {
      for (const target of c.nist_800_53) expect(target).toMatch(/^[A-Z]{2}-\d+(\(\d+\))?$/);
    }
  });
});
