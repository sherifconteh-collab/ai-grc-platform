'use strict';

/**
 * DISA Control Correlation Identifier (CCI) helpers shared by the CCI list
 * importer and the STIG XCCDF importer.
 */

const xml2js = require('xml2js');

// A CCI reference indexes into 800-53 at statement depth ("AC-2 a", "AC-2 (3)
// (d)"). The catalog's control ids stop at the control or enhancement
// ("AC-2", "AC-2(3)"), so reduce the index to that.
function toControlId(index) {
  const m = String(index).trim().match(/^([A-Z]{2})-(\d+)(?: ?\((\d+)\))?/);
  if (!m) return null;
  return m[3] ? `${m[1]}-${Number(m[2])}(${Number(m[3])})` : `${m[1]}-${Number(m[2])}`;
}

/**
 * Parse DISA's U_CCI_List.xml into { version, publishdate, rev5 } where rev5
 * maps each CCI id to the 800-53 Rev 5 control ids it references.
 */
async function parseCciList(xml) {
  const doc = await xml2js.parseStringPromise(xml, { explicitArray: true });
  const list = doc.cci_list;
  const meta = list.metadata[0];
  const rev5 = {};
  for (const item of list.cci_items[0].cci_item) {
    const refs = ((item.references || [])[0] || {}).reference || [];
    const ids = [...new Set(refs
      .filter((r) => r.$.title === 'NIST SP 800-53 Revision 5')
      .map((r) => toControlId(r.$.index))
      .filter(Boolean))];
    if (ids.length) rev5[item.$.id] = ids;
  }
  return { version: meta.version[0], publishdate: meta.publishdate[0], rev5 };
}

module.exports = { toControlId, parseCciList };
