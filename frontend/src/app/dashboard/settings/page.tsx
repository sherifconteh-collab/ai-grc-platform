'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { rolesAPI } from '@/lib/api';

interface Permission {
  id: string;
  name: string;
  description: string;
}

interface PermissionGroup {
  [resource: string]: Permission[];
}

interface Role {
  id: string;
  name: string;
  description: string;
  is_system_role: boolean;
  permission_count: number;
  user_count: number;
  permissions: string[];
}

export default function SettingsPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [allPermissions, setAllPermissions] = useState<PermissionGroup>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  // Create modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [newRolePerms, setNewRolePerms] = useState<string[]>([]);

  // Edit modal
  const [editRole, setEditRole] = useState<Role | null>(null);
  const [editPerms, setEditPerms] = useState<string[]>([]);

  // Delete confirmation
  const [deleteRoleId, setDeleteRoleId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const loadData = async () => {
    try {
      const [rolesRes, permsRes] = await Promise.all([
        rolesAPI.getAll(),
        rolesAPI.getAllPermissions()
      ]);
      setRoles(rolesRes.data.data);
      setAllPermissions(permsRes.data.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load roles');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newRoleName.trim()) return;
    try {
      await rolesAPI.create({
        name: newRoleName.trim(),
        description: newRoleDesc.trim(),
        permissions: newRolePerms
      });
      showToast(`Role "${newRoleName}" created`);
      setCreateModalOpen(false);
      setNewRoleName('');
      setNewRoleDesc('');
      setNewRolePerms([]);
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create role');
    }
  };

  const handleEdit = async () => {
    if (!editRole) return;
    try {
      await rolesAPI.update(editRole.id, {
        name: editRole.name,
        description: editRole.description,
        permissions: editPerms
      });
      showToast('Role updated');
      setEditRole(null);
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update role');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await rolesAPI.remove(id);
      showToast('Role deleted');
      setDeleteRoleId(null);
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete role');
      setDeleteRoleId(null);
    }
  };

  const openEdit = (role: Role) => {
    setEditRole(role);
    setEditPerms(role.permissions || []);
  };

  const togglePerm = (perms: string[], setPerms: (p: string[]) => void, perm: string) => {
    setPerms(perms.includes(perm) ? perms.filter(p => p !== perm) : [...perms, perm]);
  };

  const PermissionCheckboxes = ({ selected, onToggle }: { selected: string[]; onToggle: (perm: string) => void }) => (
    <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
      {Object.entries(allPermissions).map(([resource, perms]) => (
        <div key={resource}>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">{resource}</p>
          <div className="grid grid-cols-2 gap-1">
            {perms.map((p) => (
              <label key={p.name} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(p.name)}
                  onChange={() => onToggle(p.name)}
                  className="rounded"
                />
                <span className="text-gray-700">{p.name}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Toast */}
        {toast && (
          <div className="fixed top-6 right-6 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg z-50">
            {toast}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
            <p className="text-gray-600 mt-2">Manage roles and permissions for your organization</p>
          </div>
          <button
            onClick={() => { setCreateModalOpen(true); setNewRolePerms([]); }}
            className="bg-purple-600 text-white px-6 py-2 rounded-md hover:bg-purple-700 transition-colors"
          >
            + Create Role
          </button>
        </div>

        {/* Roles Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-purple-600">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase">Role</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase">Description</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase">Permissions</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase">Users</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {roles.map((role) => (
                    <tr key={role.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900">{role.name}</span>
                          {role.is_system_role && (
                            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">System</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{role.description}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{role.permission_count || 0}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{role.user_count || 0}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <button onClick={() => openEdit(role)} className="text-xs text-purple-600 hover:text-purple-800 font-medium">
                            Edit
                          </button>
                          {!role.is_system_role && (
                            <button onClick={() => setDeleteRoleId(role.id)} className="text-xs text-red-600 hover:text-red-800 font-medium">
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Create Role Modal */}
        {createModalOpen && (
          <div className="fixed inset-0 flex items-center justify-center z-50">
            <div className="fixed inset-0 bg-black opacity-50" onClick={() => setCreateModalOpen(false)}></div>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 z-10">
              <div className="p-6 border-b">
                <h3 className="text-lg font-bold text-gray-900">Create New Role</h3>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role Name</label>
                  <input
                    type="text"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    placeholder="e.g. Security Analyst"
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <input
                    type="text"
                    value={newRoleDesc}
                    onChange={(e) => setNewRoleDesc(e.target.value)}
                    placeholder="Describe what this role can do..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Permissions</label>
                  <PermissionCheckboxes selected={newRolePerms} onToggle={(p) => togglePerm(newRolePerms, setNewRolePerms, p)} />
                </div>
              </div>
              <div className="p-6 border-t flex justify-between">
                <button onClick={() => setCreateModalOpen(false)} className="px-4 py-2 text-gray-600 hover:text-gray-800">Cancel</button>
                <button onClick={handleCreate} disabled={!newRoleName.trim()} className="bg-purple-600 text-white px-6 py-2 rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed">
                  Create Role
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Role Modal */}
        {editRole && (
          <div className="fixed inset-0 flex items-center justify-center z-50">
            <div className="fixed inset-0 bg-black opacity-50" onClick={() => setEditRole(null)}></div>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 z-10">
              <div className="p-6 border-b">
                <h3 className="text-lg font-bold text-gray-900">Edit Role: {editRole.name}</h3>
                {editRole.is_system_role && (
                  <p className="text-sm text-gray-500 mt-1">System roles have limited editing options.</p>
                )}
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <input
                    type="text"
                    value={editRole.description}
                    onChange={(e) => setEditRole({ ...editRole, description: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Permissions</label>
                  <PermissionCheckboxes selected={editPerms} onToggle={(p) => togglePerm(editPerms, setEditPerms, p)} />
                </div>
              </div>
              <div className="p-6 border-t flex justify-between">
                <button onClick={() => setEditRole(null)} className="px-4 py-2 text-gray-600 hover:text-gray-800">Cancel</button>
                <button onClick={handleEdit} className="bg-purple-600 text-white px-6 py-2 rounded-md hover:bg-purple-700">Save Changes</button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation */}
        {deleteRoleId && (
          <div className="fixed inset-0 flex items-center justify-center z-50">
            <div className="fixed inset-0 bg-black opacity-50" onClick={() => setDeleteRoleId(null)}></div>
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4 z-10">
              <h3 className="text-lg font-bold text-gray-900">Delete Role?</h3>
              <p className="text-gray-600 mt-2">This role will be permanently deleted and unassigned from all users.</p>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setDeleteRoleId(null)} className="px-4 py-2 text-gray-600 hover:text-gray-800">Cancel</button>
                <button onClick={() => handleDelete(deleteRoleId)} className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700">Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
