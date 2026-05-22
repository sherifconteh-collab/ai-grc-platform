'use client';

import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ZAxis,
} from 'recharts';

interface VendorData {
  vendor_name: string;
  contract_count: number;
  active_count: number;
  risk_level: string;
}

const RISK_COLORS = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
  unknown: '#9ca3af',
};

const RISK_SCORES = {
  critical: 90,
  high: 70,
  medium: 50,
  low: 30,
  unknown: 10,
};

export function VendorRiskMatrix({ data }: { data: VendorData[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
        No vendor risk data available
      </div>
    );
  }

  const chartData = data.map(vendor => ({
    name: vendor.vendor_name,
    x: vendor.contract_count,
    y: RISK_SCORES[vendor.risk_level as keyof typeof RISK_SCORES] || RISK_SCORES.unknown,
    z: vendor.active_count * 10 + 20,
    risk: vendor.risk_level,
  }));

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis 
            type="number" 
            dataKey="x" 
            name="Contracts" 
            tick={{ fontSize: 11 }}
            label={{ value: 'Number of Contracts', position: 'insideBottom', offset: -10, fontSize: 11 }}
          />
          <YAxis 
            type="number" 
            dataKey="y" 
            name="Risk Score" 
            tick={{ fontSize: 11 }}
            domain={[0, 100]}
            label={{ value: 'Risk Score', angle: -90, position: 'insideLeft', fontSize: 11 }}
          />
          <ZAxis type="number" dataKey="z" range={[50, 400]} />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                  <div className="bg-white p-3 border border-gray-200 rounded shadow-lg">
                    <p className="font-semibold text-gray-900">{data.name}</p>
                    <p className="text-sm text-gray-600">Contracts: {data.x}</p>
                    <p className="text-sm text-gray-600">Risk: {data.risk}</p>
                    <p className="text-sm text-gray-600">Risk Score: {data.y}</p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Scatter data={chartData}>
            {chartData.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={RISK_COLORS[entry.risk as keyof typeof RISK_COLORS] || RISK_COLORS.unknown} 
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
