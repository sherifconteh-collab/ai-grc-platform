'use client';

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line,
} from 'recharts';

interface UsageDataItem {
  date: string;
  count: number;
}

export function AIUsageChart({ data }: { data: UsageDataItem[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
        No usage data available
      </div>
    );
  }

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
          <Area 
            type="monotone" 
            dataKey="count" 
            stroke="#7c3aed" 
            fill="#7c3aed" 
            fillOpacity={0.15} 
            strokeWidth={2} 
            name="AI Requests" 
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AIDecisionTimeline({ data }: { data: any[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
        No decision data available
      </div>
    );
  }

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
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
          <Line type="monotone" dataKey="high_risk" stroke="#ef4444" strokeWidth={2} name="High Risk" />
          <Line type="monotone" dataKey="medium_risk" stroke="#f59e0b" strokeWidth={2} name="Medium Risk" />
          <Line type="monotone" dataKey="low_risk" stroke="#10b981" strokeWidth={2} name="Low Risk" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
