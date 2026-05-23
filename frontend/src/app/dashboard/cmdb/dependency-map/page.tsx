'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { cmdbAPI } from '@/lib/api';

interface Asset {
  id: string;
  name: string;
  category_code?: string;
  category?: string;
  status?: string;
  criticality?: string;
}

interface Relationship {
  id: string;
  asset_id: string;
  depends_on_asset_id: string;
  dependency_type?: string;
  criticality?: string;
}

interface GraphNode {
  id: string;
  label: string;
  category: string;
  criticality: string;
  x: number;
  y: number;
}

interface GraphEdge {
  from: string;
  to: string;
  type: string;
  criticality: string;
}

const CATEGORY_COLOR: Record<string, string> = {
  hardware:         '#3b82f6',
  software:         '#6366f1',
  ai_agent:         '#8b5cf6',
  'ai-agents':      '#8b5cf6',
  service_account:  '#f59e0b',
  'service-accounts': '#f59e0b',
  environment:      '#14b8a6',
  environments:     '#14b8a6',
  password_vault:   '#f43f5e',
  'password-vaults': '#f43f5e',
  database:         '#10b981',
  cloud:            '#0ea5e9',
  network:          '#84cc16',
};

const CRITICALITY_STROKE: Record<string, string> = {
  critical: '#dc2626',
  high:     '#ea580c',
  medium:   '#ca8a04',
  low:      '#16a34a',
};

function categoryColor(cat: string) {
  return CATEGORY_COLOR[cat] || '#6b7280';
}

function layoutNodes(nodes: Omit<GraphNode, 'x' | 'y'>[], edges: GraphEdge[]): GraphNode[] {
  const W = 900, H = 600, CX = W / 2, CY = H / 2;
  if (nodes.length === 0) return [];

  // Build adjacency for degree-based radius positioning
  const degree: Record<string, number> = {};
  nodes.forEach(n => { degree[n.id] = 0; });
  edges.forEach(e => { degree[e.from] = (degree[e.from] || 0) + 1; degree[e.to] = (degree[e.to] || 0) + 1; });

  // Group by category for cluster layout
  const groups: Record<string, typeof nodes> = {};
  nodes.forEach(n => {
    const g = n.category || 'other';
    if (!groups[g]) groups[g] = [];
    groups[g].push(n);
  });

  const result: GraphNode[] = [];
  const groupKeys = Object.keys(groups);
  const numGroups = groupKeys.length;
  const outerR = Math.min(CX, CY) - 80;

  groupKeys.forEach((g, gi) => {
    const groupAngle = (2 * Math.PI * gi) / numGroups - Math.PI / 2;
    const gx = CX + outerR * 0.65 * Math.cos(groupAngle);
    const gy = CY + outerR * 0.65 * Math.sin(groupAngle);
    const members = groups[g];
    members.forEach((n, ni) => {
      const spread = members.length === 1 ? 0 : 55;
      const a2 = (2 * Math.PI * ni) / members.length;
      result.push({
        ...n,
        x: gx + spread * Math.cos(a2),
        y: gy + spread * Math.sin(a2),
      });
    });
  });
  return result;
}

export default function DependencyMapPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [assetsRes, relsRes] = await Promise.all([
        cmdbAPI.allAssets(),
        cmdbAPI.relationships.getAll(),
      ]);
      setAssets(assetsRes.data?.data ?? assetsRes.data ?? []);
      setRelationships(relsRes.data?.data ?? relsRes.data ?? []);
    } catch (e: any) {
      setError('Could not load CMDB data. Ensure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  // Build graph
  const nodeMap: Record<string, Asset> = {};
  assets.forEach(a => { nodeMap[a.id] = a; });

  const filteredAssets = filter === 'all' ? assets : assets.filter(a => {
    const cat = (a.category_code || a.category || '').toLowerCase();
    return cat === filter || cat.replace(/_/g, '-') === filter;
  });
  const filteredIds = new Set(filteredAssets.map(a => a.id));
  const filteredRels = relationships.filter(r => filteredIds.has(r.asset_id) && filteredIds.has(r.depends_on_asset_id));

  const rawNodes = filteredAssets.map(a => ({
    id: a.id,
    label: a.name,
    category: (a.category_code || a.category || 'other').toLowerCase(),
    criticality: a.criticality || 'medium',
  }));

  const edges: GraphEdge[] = filteredRels.map(r => ({
    from: r.asset_id,
    to: r.depends_on_asset_id,
    type: r.dependency_type || 'uses',
    criticality: r.criticality || 'medium',
  }));

  const nodes = layoutNodes(rawNodes, edges);
  const nodeById: Record<string, GraphNode> = {};
  nodes.forEach(n => { nodeById[n.id] = n; });

  const categories = [...new Set(assets.map(a => (a.category_code || a.category || 'other').toLowerCase()))];

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/cmdb" className="text-sm text-gray-500 hover:text-gray-700">← CMDB</Link>
            <h1 className="text-2xl font-bold text-gray-900">Dependency Graph</h1>
            <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-semibold">Enterprise</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Filter:</label>
            <select value={filter} onChange={e => setFilter(e.target.value)} className="text-sm border border-gray-300 rounded px-2 py-1">
              <option value="all">All categories</option>
              {categories.map(c => <option key={c} value={c}>{c.replace(/-/g, ' ').replace(/_/g, ' ')}</option>)}
            </select>
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded text-sm">{error}</div>}

        {loading ? (
          <div className="text-center py-20 text-gray-500">Loading dependency graph…</div>
        ) : nodes.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-500 mb-2">No assets found.</p>
            <p className="text-sm text-gray-400">Add assets and link them together using the 🔗 Links button on each asset row.</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl shadow overflow-hidden">
            <svg ref={svgRef} width="100%" viewBox="0 0 900 600" className="block">
              <defs>
                <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                  <polygon points="0 0, 8 3, 0 6" fill="#9ca3af" />
                </marker>
                <marker id="arrowhead-critical" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                  <polygon points="0 0, 8 3, 0 6" fill="#dc2626" />
                </marker>
              </defs>

              {/* Edges */}
              {edges.map((e, i) => {
                const from = nodeById[e.from];
                const to = nodeById[e.to];
                if (!from || !to) return null;
                const stroke = CRITICALITY_STROKE[e.criticality] || '#9ca3af';
                const isCritical = e.criticality === 'critical';
                return (
                  <g key={i}>
                    <line
                      x1={from.x} y1={from.y}
                      x2={to.x} y2={to.y}
                      stroke={stroke} strokeWidth={isCritical ? 2.5 : 1.5}
                      strokeDasharray={e.type === 'communicates_with' ? '5,3' : undefined}
                      markerEnd={isCritical ? 'url(#arrowhead-critical)' : 'url(#arrowhead)'}
                      opacity={0.7}
                    />
                    <text
                      x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 4}
                      textAnchor="middle" fontSize={8} fill="#6b7280" fontStyle="italic"
                    >
                      {e.type.replace(/_/g, ' ')}
                    </text>
                  </g>
                );
              })}

              {/* Nodes */}
              {nodes.map(n => {
                const color = categoryColor(n.category);
                const isSelected = selectedNode?.id === n.id;
                const r = 26;
                return (
                  <g
                    key={n.id}
                    transform={`translate(${n.x},${n.y})`}
                    className="cursor-pointer"
                    onClick={() => setSelectedNode(isSelected ? null : n)}
                  >
                    <circle r={r + (isSelected ? 4 : 0)} fill={color} opacity={isSelected ? 1 : 0.85}
                      stroke={isSelected ? '#1e1b4b' : 'white'} strokeWidth={isSelected ? 3 : 2}
                    />
                    <text textAnchor="middle" dy="0.35em" fontSize={9} fill="white" fontWeight="600"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {n.label.length > 12 ? n.label.slice(0, 11) + '…' : n.label}
                    </text>
                    <text textAnchor="middle" y={r + 13} fontSize={8} fill="#374151"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {n.category.replace(/-/g, ' ')}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Legend */}
            <div className="border-t border-gray-100 px-4 py-3 flex flex-wrap gap-4 items-center">
              <span className="text-xs font-semibold text-gray-500 mr-1">Categories:</span>
              {[
                { key: 'hardware',    label: 'Hardware',   color: '#3b82f6' },
                { key: 'software',    label: 'Software',   color: '#6366f1' },
                { key: 'ai_agent',    label: 'AI Agents',  color: '#8b5cf6' },
                { key: 'service_account', label: 'Service Accounts', color: '#f59e0b' },
                { key: 'environment', label: 'Environments', color: '#14b8a6' },
                { key: 'database',    label: 'Database',   color: '#10b981' },
              ].map(l => (
                <div key={l.key} className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full inline-block" style={{ background: l.color }} />
                  <span className="text-xs text-gray-600">{l.label}</span>
                </div>
              ))}
              <span className="ml-4 text-xs text-gray-400">Click a node to highlight · Dashed = communicates_with · Solid = hosted_on / uses / requires</span>
            </div>
          </div>
        )}

        {/* Selected node detail */}
        {selectedNode && (
          <div className="bg-white border border-purple-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-gray-900">{selectedNode.label}</h3>
                <p className="text-sm text-gray-500 capitalize">{selectedNode.category.replace(/-/g, ' ')} · criticality: {selectedNode.criticality}</p>
              </div>
              <button onClick={() => setSelectedNode(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600">
              <div>
                <p className="font-semibold text-gray-700 mb-1">Depends on ({edges.filter(e => e.from === selectedNode.id).length}):</p>
                {edges.filter(e => e.from === selectedNode.id).map((e, i) => {
                  const target = nodeById[e.to];
                  return target ? <p key={i} className="text-gray-500">→ {target.label} <span className="italic">({e.type.replace(/_/g, ' ')})</span></p> : null;
                })}
                {edges.filter(e => e.from === selectedNode.id).length === 0 && <p className="text-gray-400 italic">none</p>}
              </div>
              <div>
                <p className="font-semibold text-gray-700 mb-1">Used by ({edges.filter(e => e.to === selectedNode.id).length}):</p>
                {edges.filter(e => e.to === selectedNode.id).map((e, i) => {
                  const src = nodeById[e.from];
                  return src ? <p key={i} className="text-gray-500">← {src.label} <span className="italic">({e.type.replace(/_/g, ' ')})</span></p> : null;
                })}
                {edges.filter(e => e.to === selectedNode.id).length === 0 && <p className="text-gray-400 italic">none</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
