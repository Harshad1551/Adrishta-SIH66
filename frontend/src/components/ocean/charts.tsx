import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ProfilePoint, SeriesPoint } from "@/lib/ocean/data";

const axis = {
  stroke: "var(--muted-foreground)",
  fontSize: 11,
  tickLine: false,
  axisLine: { stroke: "var(--border)" },
};

const tooltipStyle = {
  contentStyle: {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: "var(--muted-foreground)", fontSize: 11 },
} as const;

export function ProfileChart({
  data,
  height = 320,
  showArgo = true,
  thermocline,
  compare,
  compareName,
}: {
  data: ProfilePoint[];
  height?: number;
  showArgo?: boolean;
  thermocline?: number;
  compare?: ProfilePoint[];
  compareName?: string;
}) {
  const merged = data.map((p, i) => ({
    ...p,
    lower: p.lo,
    span: +(p.hi - p.lo).toFixed(3),
    compare: compare?.[i]?.temp ?? null,
  }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart
        data={merged}
        margin={{ top: 8, right: 12, bottom: 8, left: 0 }}
        layout="vertical"
      >
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis
          type="number"
          dataKey="temp"
          domain={["dataMin - 2", "dataMax + 2"]}
          {...axis}
          unit="°C"
        />
        <YAxis
          type="number"
          dataKey="depth"
          reversed
          domain={[0, 1000]}
          {...axis}
          width={52}
          unit=" m"
        />
        <Tooltip
          {...tooltipStyle}
          formatter={(v: number | string, n) => [`${v} ${n === "depth" ? "m" : "°C"}`, String(n)]}
        />
        <Area
          dataKey="lower"
          stackId="band"
          stroke="none"
          fill="transparent"
          isAnimationActive={false}
        />
        <Area
          dataKey="span"
          stackId="band"
          stroke="none"
          fill="var(--primary)"
          fillOpacity={0.16}
          name="Uncertainty"
          isAnimationActive={false}
        />
        <Line
          dataKey="temp"
          stroke="var(--cyan)"
          strokeWidth={2.2}
          dot={false}
          name="OceanEmbed reconstruction"
        />
        {compare && (
          <Line
            dataKey="compare"
            stroke="var(--warm)"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            name={compareName ?? "Comparison"}
          />
        )}
        {showArgo && (
          <Scatter
            dataKey="argo"
            fill="var(--aqua)"
            name="Independent ARGO observation"
            shape="circle"
          />
        )}
        {thermocline != null && (
          <ReferenceLine
            y={thermocline}
            stroke="var(--warm)"
            strokeDasharray="4 4"
            label={{
              value: `Thermocline ${thermocline} m`,
              fill: "var(--warm)",
              fontSize: 11,
              position: "insideBottomRight",
            }}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function SeriesChart({
  data,
  height = 280,
  unit = "°C",
}: {
  data: SeriesPoint[];
  height?: number;
  unit?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" {...axis} minTickGap={24} />
        <YAxis yAxisId="t" {...axis} width={46} unit={unit} domain={["auto", "auto"]} />
        <YAxis yAxisId="a" orientation="right" {...axis} width={40} unit={unit} />
        <Tooltip {...tooltipStyle} />
        <ReferenceLine yAxisId="a" y={0} stroke="var(--border)" />
        <Bar
          yAxisId="a"
          dataKey="anomaly"
          name="Temperature Anomaly"
          fill="var(--warm)"
          opacity={0.45}
        />
        <Line
          yAxisId="t"
          dataKey="temp"
          name="Reconstructed temperature"
          stroke="var(--cyan)"
          strokeWidth={2}
          dot={false}
        />
        {data
          .filter((d) => d.event)
          .map((d) => (
            <ReferenceLine
              key={d.date}
              yAxisId="t"
              x={d.label}
              stroke={d.event === "MHW" ? "var(--hot)" : "var(--cool)"}
              strokeDasharray="3 3"
            />
          ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function BarsChart({
  data,
  keys,
  height = 260,
  xKey = "name",
}: {
  data: Array<Record<string, string | number>>;
  keys: Array<{ key: string; name: string; color: string }>;
  height?: number;
  xKey?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={xKey} {...axis} />
        <YAxis {...axis} width={44} />
        <Tooltip {...tooltipStyle} cursor={{ fill: "var(--muted)", opacity: 0.3 }} />
        {keys.map((k) => (
          <Bar key={k.key} dataKey={k.key} name={k.name} fill={k.color} radius={[3, 3, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LossChart({
  data,
  height = 260,
}: {
  data: Array<{ epoch: number; data: number; physics: number; total: number }>;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="epoch" {...axis} unit="e" minTickGap={20} />
        <YAxis {...axis} width={46} />
        <Tooltip {...tooltipStyle} />
        <Line dataKey="data" name="Data Loss" stroke="var(--cyan)" strokeWidth={2} dot={false} />
        <Line
          dataKey="physics"
          name="Physics Loss"
          stroke="var(--warm)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          dataKey="total"
          name="Total Loss"
          stroke="var(--teal)"
          strokeWidth={2}
          strokeDasharray="4 4"
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
