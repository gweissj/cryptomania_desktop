import { LineChart, Line, XAxis, YAxis } from "recharts";

export default function Sparkline({ data }) {
  if (!data || data.length === 0) return null;

  const points = data.map((v, idx) => ({ idx, value: v }));

  return (
    <LineChart width={90} height={32} data={points}>
      <XAxis dataKey="idx" hide />
      <YAxis dataKey="value" domain={["dataMin", "dataMax"]} hide />
      <Line
        type="monotone"
        dataKey="value"
        stroke="#22c55e"
        strokeWidth={2}
        dot={false}
      />
    </LineChart>
  );
}