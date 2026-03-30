'use client';

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
} from 'recharts';

/* ------------------------------------------------------------------ */
/*  StatusPieChart                                                     */
/* ------------------------------------------------------------------ */

interface StatusDatum {
  name: string;
  value: number;
  color: string;
}

interface StatusPieChartProps {
  data: StatusDatum[];
  onSliceClick?: (name: string) => void;
}

export function StatusPieChart({ data, onSliceClick }: StatusPieChartProps) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={80}
          paddingAngle={2}
          dataKey="value"
          onClick={(entry) => entry.name != null && onSliceClick?.(String(entry.name))}
          style={{ cursor: onSliceClick ? 'pointer' : undefined }}
        >
          {data.map((d) => (
            <Cell key={d.name} fill={d.color} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------------------------ */
/*  FrameworkBarChart                                                   */
/* ------------------------------------------------------------------ */

interface FrameworkDatum {
  name: string;
  code: string;
  fullName: string;
  compliance: number;
  implemented: number;
  total: number;
  remaining: number;
}

interface FrameworkBarChartProps {
  data: FrameworkDatum[];
}

export function FrameworkBarChart({ data }: FrameworkBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ left: 20, right: 20 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" domain={[0, 100]} unit="%" />
        <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
        <Tooltip
          formatter={(value, _name, item) => {
            const payload = item.payload as FrameworkDatum | undefined;
            return [`${value}%`, payload?.fullName ?? String(_name)];
          }}
        />
        <Bar dataKey="compliance" fill="#7c3aed" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------------------------ */
/*  ComplianceTrendChart                                               */
/* ------------------------------------------------------------------ */

interface TrendDatum {
  date?: string;
  compliance?: number;
  [key: string]: unknown;
}

interface ComplianceTrendChartProps {
  data: TrendDatum[];
}

export function ComplianceTrendChart({ data }: ComplianceTrendChartProps) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis domain={[0, 100]} unit="%" />
        <Tooltip />
        <Line
          type="monotone"
          dataKey="compliance"
          stroke="#7c3aed"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
