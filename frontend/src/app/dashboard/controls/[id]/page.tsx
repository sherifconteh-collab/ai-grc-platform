'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { controlsAPI, implementationsAPI, usersAPI } from '@/lib/api';

interface Implementation {
  id: string;
  status: string;
  assigned_to: string | null;
  assigned_to_name: string | null;
  assigned_to_email: string | null;
  due_date: string | null;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  status_history: StatusHistoryEntry[];
  evidence: EvidenceItem[];
}

interface StatusHistoryEntry {
  id: string;
  old_status: string;
  new_status: string;
  notes: string | null;
  changed_at: string;
  changed_by_name: string;
}

interface EvidenceItem {
  id: string;
  file_name: string;
  description: string | null;
  mime_type: string;
  uploaded_at: string;
  link_notes: string | null;
  uploaded_by_name: string;
}

interface OrgUser {
  id: string;
  email: string;
  full_name: string;
}

const VALID_STATUSES = [
  { value: 'not_started', label: 'Not Started', color: 'bg-gray-100 text-gray-800' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'implemented', label: 'Implemented', color: 'bg-green-100 text-green-800' },
  { value: 'verified', label: 'Verified', color: 'bg-emerald-100 text-emerald-800' },
  { value: 'not_applicable', label: 'Not Applicable', color: 'bg-purple-100 text-purple-800' },
];

function getStatusInfo(status: string) {
  return VALID_STATUSES.find(s => s.value === status) || VALID_STATUSES[0];
}

function getPriorityLabel(priority: string | number) {
  const p = Number(priority);
  if (p >= 3) return { label: 'Critical', color: 'bg-red-100 text-red-800' };
  if (p === 2) return { label: 'High', color: 'bg-orange-100 text-orange-800' };
  if (p === 1) return { label: 'Medium', color: 'bg-yellow-100 text-yellow-800' };
  return { label: 'Low', color: 'bg-blue-100 text-blue-800' };
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDatetime(dateStr: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ControlDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [controlData, setControlData] = useState<any>(null);
  const [implementation, setImplementation] = useState<Implementation | null>(null);
  const [orgUsers, setOrgUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const [selectedStatus, setSelectedStatus] = useState('');
  const [statusNotes, setStatusNotes] = useState('');
  const [updating, setUpdating] = useState(false);

  const [assignedUserId, setAssignedUserId] = useState<string>('');
  const [dueDate, setDueDate] = useState('');

  useEffect(() => {
    if (id) loadData();
  }, [id]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const loadData = async () => {
    try {
      const [controlRes, implListRes, usersRes] = await Promise.all([
        controlsAPI.getControl(id),
        implementationsAPI.getAll({ controlId: id }),
        usersAPI.getOrgUsers()
      ]);

      setControlData(controlRes.data.data);
      setOrgUsers(usersRes.data.data);

      const implList = implListRes.data.data;
      if (implList && implList.length > 0) {
        const implDetailRes = await implementationsAPI.getById(implList[0].id);
        const impl = implDetailRes.data.data;
        setImplementation(impl);
        setSelectedStatus(impl.status);
        setAssignedUserId(impl.assigned_to || '');
        setDueDate(impl.due_date ? impl.due_date.split('T')[0] : '');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load control');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async () => {
    if (!implementation || selectedStatus === implementation.status) return;
    setUpdating(true);
    setError('');
    try {
      await implementationsAPI.updateStatus(implementation.id, {
        status: selectedStatus,
        notes: statusNotes || undefined
      });
      showToast(`Status updated to "${getStatusInfo(selectedStatus).label}"`);
      setStatusNotes('');
      setUpdating(false);
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update status');
      setUpdating(false);
    }
  };

  const handleAssignment = async () => {
    if (!implementation) return;
    setUpdating(true);
    setError('');
    try {
      await implementationsAPI.assign(implementation.id, {
        assignedTo: assignedUserId || null,
        dueDate: dueDate || null
      });
      showToast('Assignment updated');
      setUpdating(false);
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update assignment');
      setUpdating(false);
    }
  };

  const handleReview = async () => {
    if (!implementation) return;
    setUpdating(true);
    try {
      await implementationsAPI.review(implementation.id, {
        notes: statusNotes || undefined,
        stillApplicable: true,
        evidenceUpdated: (implementation.evidence || []).length > 0
      });
      showToast('Review recorded');
      setStatusNotes('');
      setUpdating(false);
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to record review');
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (error && !controlData) {
    return (
      <DashboardLayout>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>
      </DashboardLayout>
    );
  }

  const statusInfo = implementation ? getStatusInfo(implementation.status) : getStatusInfo('not_started');
  const priorityInfo = controlData ? getPriorityLabel(controlData.priority) : getPriorityLabel(0);

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

        {/* Breadcrumb */}
        <div className="flex items-center text-sm text-gray-600">
          <Link href="/dashboard/controls" className="hover:text-purple-600">Controls</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900 font-medium">
            {controlData?.control_id || controlData?.controlId || id}
          </span>
        </div>

        {/* Control Header */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-gray-900">
                  {controlData?.control_id || controlData?.controlId}
                </h1>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusInfo.color}`}>
                  {statusInfo.label}
                </span>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${priorityInfo.color}`}>
                  {priorityInfo.label} Priority
                </span>
              </div>
              <h2 className="text-lg font-semibold text-gray-700 mt-2">
                {controlData?.title}
              </h2>
              <p className="text-gray-600 mt-1">
                {controlData?.description}
              </p>
            </div>
            <div className="text-right">
              <span className="inline-block bg-purple-50 text-purple-700 px-3 py-1 rounded text-sm font-medium">
                {controlData?.framework_code || controlData?.frameworkCode}
              </span>
              <p className="text-xs text-gray-500 mt-1">
                {controlData?.framework_name || controlData?.frameworkName}
              </p>
            </div>
          </div>
        </div>

        {/* Status & Assignment Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Status Workflow Card */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Status Workflow</h3>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Change Status</label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                {VALID_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
              <textarea
                value={statusNotes}
                onChange={(e) => setStatusNotes(e.target.value)}
                rows={3}
                placeholder="Add notes about this status change..."
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleStatusUpdate}
                disabled={updating || !implementation || selectedStatus === implementation.status}
                className="flex-1 bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {updating ? 'Updating...' : 'Update Status'}
              </button>
              <button
                onClick={handleReview}
                disabled={updating || !implementation}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Review
              </button>
            </div>
          </div>

          {/* Assignment Card */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Assignment</h3>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Assign To</label>
              <select
                value={assignedUserId}
                onChange={(e) => setAssignedUserId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="">Unassigned</option>
                {orgUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} ({u.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>

            <button
              onClick={handleAssignment}
              disabled={updating || !implementation}
              className="w-full bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {updating ? 'Updating...' : 'Update Assignment'}
            </button>

            {implementation?.assigned_to_name && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-xs text-gray-500">Currently assigned to</p>
                <p className="text-sm font-medium text-gray-900">{implementation.assigned_to_name}</p>
                <p className="text-xs text-gray-500">{implementation.assigned_to_email}</p>
                {implementation.due_date && (
                  <p className="text-xs text-gray-500 mt-1">Due: {formatDate(implementation.due_date)}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Linked Evidence */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">Linked Evidence</h3>
            <span className="text-sm text-gray-500">
              {implementation?.evidence?.length || 0} file{implementation?.evidence?.length !== 1 ? 's' : ''}
            </span>
          </div>

          {implementation?.evidence && implementation.evidence.length > 0 ? (
            <div className="space-y-3">
              {implementation.evidence.map((ev) => (
                <div key={ev.id} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">📄</span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{ev.file_name}</p>
                      <p className="text-xs text-gray-500">
                        {ev.description || 'No description'} · Uploaded by {ev.uploaded_by_name} · {formatDate(ev.uploaded_at)}
                      </p>
                      {ev.link_notes && <p className="text-xs text-purple-600 italic">{ev.link_notes}</p>}
                    </div>
                  </div>
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">Linked</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-gray-500">
              <p className="text-sm">No evidence linked to this control yet.</p>
              <p className="text-xs mt-1">Upload evidence on the Evidence page and link it here.</p>
            </div>
          )}
        </div>

        {/* Status History Timeline */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Status History</h3>
          {implementation?.status_history && implementation.status_history.length > 0 ? (
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>
              <div className="space-y-4">
                {implementation.status_history.map((entry) => (
                  <div key={entry.id} className="relative flex items-start gap-4 pl-10">
                    <div className="absolute left-2.5 top-2 w-3 h-3 rounded-full bg-purple-600 border-2 border-white shadow"></div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${getStatusInfo(entry.old_status).color}`}>
                          {getStatusInfo(entry.old_status).label}
                        </span>
                        <span className="text-gray-400 text-xs">→</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${getStatusInfo(entry.new_status).color}`}>
                          {getStatusInfo(entry.new_status).label}
                        </span>
                        <span className="text-xs text-gray-500 ml-auto">{formatDatetime(entry.changed_at)}</span>
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5">
                        by {entry.changed_by_name || 'Unknown'}
                        {entry.notes && <span className="ml-2 italic">— {entry.notes}</span>}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No history yet.</p>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
