'use client';

import { useRouter } from 'next/navigation';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
  AreaChart, Area,
} from 'recharts';

const CHART_COLORS = ['#7c3aed', '#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

interface StatusDataItem {
  name: string;
  value: number;
  color: string;
}

interface FrameworkChartItem {
  name: string;
  code: string;
  fullName: string;
  compliance: number;
  implemented: number;
  total: number;
  remaining: number;
}

interface TrendDataItem {
  date: string;
  implemented: number;
  total_changes: number;
}

export function StatusPieChart({ data, onSliceClick }: { data: StatusDataItem[]; onSliceClick?: (status: string) => void }) {
  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
        No implementation data yet
      </div>
    );
  }
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={3}
            dataKey="value"
            label={({ name, value }: { name: string; value: number }) => `${name}: ${value}`}
            style={onSliceClick ? { cursor: 'pointer' } : undefined}
            onClick={onSliceClick ? (entry: StatusDataItem) => onSliceClick(entry.name) : undefined}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FrameworkBarChart({ data }: { data: FrameworkChartItem[] }) {
  const router = useRouter();

  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
        Select frameworks to see compliance data
      </div>
    );
  }
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
          onClick={(state) => {
            if (state?.activePayload?.[0]?.payload?.code) {
              router.push(`/dashboard/controls?framework=${encodeURIComponent(state.activePayload[0].payload.code)}`);
            }
          }}
          style={{ cursor: 'pointer' }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-25} textAnchor="end" height={60} />
          <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
          <Tooltip
            formatter={(value: number, name: string) => {
              if (name === 'compliance') return [`${value}%`, 'Compliance'];
              return [value, name];
            }}
            labelFormatter={(label: string) => {
              const item = data.find(d => d.name === label);
              return `${item?.fullName || label} — Click to view controls`;
            }}
          />
          <Bar dataKey="compliance" radius={[4, 4, 0, 0]}>
            {data.map((_, index) => (
              <Cell key={`bar-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ComplianceTrendChart({ data }: { data: TrendDataItem[] }) {
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            tickFormatter={(v: string) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip
            labelFormatter={(v: string) => new Date(v).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          />
          <Area type="monotone" dataKey="implemented" stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.15} strokeWidth={2} name="Implemented" />
          <Area type="monotone" dataKey="total_changes" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.08} strokeWidth={2} name="Total Changes" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
