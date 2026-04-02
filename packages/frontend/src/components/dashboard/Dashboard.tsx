/**
 * Dashboard Component
 * Componente React para visualização de dashboards
 */

import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

interface DashboardWidget {
  id: string;
  type: 'metric' | 'chart' | 'table' | 'gauge' | 'status';
  title: string;
  data?: any;
  position: { x: number; y: number; w: number; h: number };
  options?: Record<string, any>;
}

interface DashboardProps {
  dashboardId: string;
  title: string;
  widgets: DashboardWidget[];
  refreshInterval?: number;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8DD1E1', '#82CA9D'];

export const Dashboard: React.FC<DashboardProps> = ({
  dashboardId,
  title,
  widgets,
  refreshInterval = 5000,
}) => {
  const [widgetData, setWidgetData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Carregar dados dos widgets
  useEffect(() => {
    const loadWidgetData = async () => {
      try {
        const widgetIds = widgets.map((w) => w.id);
        const response = await fetch(`/api/dashboards/${dashboardId}/data`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ widgetIds }),
        });

        if (response.ok) {
          const data = await response.json();
          setWidgetData(data.data);
          setLastUpdate(new Date());
        }
      } catch (error) {
        console.error('Failed to load widget data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadWidgetData();

    const interval = setInterval(loadWidgetData, refreshInterval);
    return () => clearInterval(interval);
  }, [dashboardId, widgets, refreshInterval]);

  // Renderizar widget baseado no tipo
  const renderWidget = (widget: DashboardWidget) => {
    const data = widgetData[widget.id];

    switch (widget.type) {
      case 'metric':
        return <MetricWidget widget={widget} data={data} />;
      case 'chart':
        return <ChartWidget widget={widget} data={data} />;
      case 'table':
        return <TableWidget widget={widget} data={data} />;
      case 'gauge':
        return <GaugeWidget widget={widget} data={data} />;
      case 'status':
        return <StatusWidget widget={widget} data={data} />;
      default:
        return <div>Unknown widget type: {widget.type}</div>;
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-lg">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <p className="text-sm text-gray-500">Last updated: {lastUpdate.toLocaleTimeString()}</p>
        </div>
        <div className="flex items-center space-x-2">
          {loading && (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
          )}
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Grid de Widgets */}
      <div className="grid grid-cols-12 gap-4">
        {widgets.map((widget) => (
          <div
            key={widget.id}
            className={`
              bg-white border border-gray-200 rounded-lg p-4
              col-span-${widget.position.w}
              row-span-${widget.position.h}
            `}
          >
            {renderWidget(widget)}
          </div>
        ))}
      </div>
    </div>
  );
};

// Widget de Métrica
const MetricWidget: React.FC<{ widget: DashboardWidget; data: any }> = ({ widget, data }) => {
  const formatValue = (value: number, options?: any) => {
    if (!options) return value.toString();

    let formatted = value.toString();

    if (options.suffix) {
      formatted += ` ${options.suffix}`;
    }

    if (options.format === 'duration') {
      const hours = Math.floor(value / 3600);
      const minutes = Math.floor((value % 3600) / 60);
      const seconds = value % 60;
      formatted = `${hours}h ${minutes}m ${seconds}s`;
    }

    return formatted;
  };

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{widget.title}</h3>
      <div className="text-3xl font-bold text-blue-600">
        {data ? formatValue(data.value, widget.options) : 'Loading...'}
      </div>
    </div>
  );
};

// Widget de Gráfico
const ChartWidget: React.FC<{ widget: DashboardWidget; data: any }> = ({ widget, data }) => {
  if (!data || !Array.isArray(data)) {
    return (
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{widget.title}</h3>
        <div className="flex items-center justify-center h-48 text-gray-500">Loading...</div>
      </div>
    );
  }

  const chartType = widget.options?.chartType || 'line';
  const chartData = data.map((item: any) => ({
    ...item,
    time: new Date(item.timestamp).toLocaleTimeString(),
  }));

  if (chartType === 'bar') {
    return (
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{widget.title}</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="value" fill="#0088FE" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (chartType === 'pie') {
    return (
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{widget.title}</h3>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, value }) => `${name}: ${value}`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {chartData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{widget.title}</h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="value" stroke="#0088FE" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

// Widget de Tabela
const TableWidget: React.FC<{ widget: DashboardWidget; data: any }> = ({ widget, data }) => {
  if (!data || !Array.isArray(data)) {
    return (
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{widget.title}</h3>
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  const columns = widget.options?.columns || [];
  const sortBy = widget.options?.sortBy;

  const sortedData = [...data];
  if (sortBy) {
    sortedData.sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      if (widget.options?.sortOrder === 'desc') {
        return bVal - aVal;
      }
      return aVal - bVal;
    });
  }

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{widget.title}</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((col: any) => (
                <th
                  key={col.key}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedData.map((row: any, index) => (
              <tr key={index}>
                {columns.map((col: any) => (
                  <td key={col.key} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {col.type === 'number' ? row[col.key].toLocaleString() : row[col.key]}
                    {col.type === 'percentage' && (
                      <span className="text-green-600">{row[col.key]}%</span>
                    )}
                    {col.type === 'boolean' && (
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          row[col.key] ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {row[col.key] ? 'Yes' : 'No'}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Widget de Gauge
const GaugeWidget: React.FC<{ widget: DashboardWidget; data: any }> = ({ widget, data }) => {
  if (!data) {
    return (
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{widget.title}</h3>
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  const value = data.value || 0;
  const { min = 0, max = 100, thresholds = [] } = widget.options || {};
  const percentage = ((value - min) / (max - min)) * 100;

  // Determinar cor baseada nos thresholds
  let color = 'bg-green-500';
  for (const threshold of thresholds) {
    if (value >= threshold.value) {
      color = threshold.color;
    }
  }

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{widget.title}</h3>
      <div className="relative">
        <div className="w-full bg-gray-200 rounded-full h-4">
          <div
            className={`h-4 rounded-full transition-all duration-300 ${color}`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
        <div className="mt-2 text-center">
          <span className="text-2xl font-bold text-gray-900">{value}</span>
          <span className="text-sm text-gray-500 ml-1">/ {max}</span>
        </div>
      </div>
    </div>
  );
};

// Widget de Status
const StatusWidget: React.FC<{ widget: DashboardWidget; data: any }> = ({ widget, data }) => {
  if (!data) {
    return (
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{widget.title}</h3>
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  const status = data.status || 'unknown';
  const statusMapping = widget.options?.statusMapping || {
    healthy: 'green',
    warning: 'yellow',
    unhealthy: 'red',
  };

  const color = statusMapping[status] || 'gray';

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{widget.title}</h3>
      <div className="flex items-center">
        <div className={`w-3 h-3 rounded-full bg-${color}-500 mr-2`}></div>
        <span className={`text-${color}-700 capitalize font-medium`}>{status}</span>
      </div>
    </div>
  );
};

export default Dashboard;
