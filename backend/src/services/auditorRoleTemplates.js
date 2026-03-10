// @tier: free
const AUDITOR_SUBROLE_TEMPLATES = [
  {
    name: 'auditor_lead',
    description: 'Lead auditor with full auditor workflow access.'
  },
  {
    name: 'auditor_fieldwork',
    description: 'Fieldwork auditor focused on evidence collection and procedure execution.'
  },
  {
    name: 'auditor_observer',
    description: 'Read-focused auditor role for observation and quality checks.'
  }
];

const OBSERVER_RESTRICTED_PERMISSIONS = new Set(['assessments.write']);

function derivePermissionSet(templateName, basePermissions) {
  const permissionSet = new Set(basePermissions);
  if (templateName === 'auditor_observer') {
    for (const blocked of OBSERVER_RESTRICTED_PERMISSIONS) {
      permissionSet.delete(blocked);
    }
  }
  return Array.from(permissionSet);
}

async function ensureAuditorSubroles(client, organizationId) {
  const baseRoleResult = await client.query(
    `SELECT id
     FROM roles
     WHERE is_system_role = true
       AND name = 'auditor'
     LIMIT 1`
  );

  if (baseRoleResult.rows.length === 0) {
    const error = new Error('System auditor role is not configured');
    error.statusCode = 500;
    throw error;
  }

  const basePermissionsResult = await client.query(
    `SELECT DISTINCT p.name
     FROM role_permissions rp
     JOIN permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = $1`,
    [baseRoleResult.rows[0].id]
  );

  const basePermissions = basePermissionsResult.rows.map((row) => String(row.name || ''));

  const outputs = [];
  for (const template of AUDITOR_SUBROLE_TEMPLATES) {
    const existingRole = await client.query(
      `SELECT id, name
       FROM roles
       WHERE organization_id = $1
         AND is_system_role = false
         AND LOWER(name) = LOWER($2)
       LIMIT 1`,
      [organizationId, template.name]
    );

    let roleId;
    let created = false;
    if (existingRole.rows.length > 0) {
      roleId = existingRole.rows[0].id;
    } else {
      const createdRole = await client.query(
        `INSERT INTO roles (organization_id, name, description, is_system_role)
         VALUES ($1, $2, $3, false)
         RETURNING id`,
        [organizationId, template.name, template.description]
      );
      roleId = createdRole.rows[0].id;
      created = true;
    }

    const permissionNames = derivePermissionSet(template.name, basePermissions);
    const permissionResult = await client.query(
      `SELECT id, name
       FROM permissions
       WHERE name = ANY($1::text[])`,
      [permissionNames]
    );
    const permissionIds = permissionResult.rows.map((row) => row.id);

    await client.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);
    for (const permissionId of permissionIds) {
      await client.query(
        'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [roleId, permissionId]
      );
    }

    outputs.push({
      role_id: roleId,
      name: template.name,
      created,
      permission_count: permissionIds.length
    });
  }

  return outputs;
}

module.exports = {
  ensureAuditorSubroles
};
