"use client"

import { useReducedMotion } from "motion/react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@workspace/ui/components/chart"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import type { ChartOutput, StudyOutputCitation } from "@/lib/study-output-types"
import { StudyOutputCitations } from "./study-output-citations"

const colors = [
  "var(--info-accent)",
  "var(--foreground)",
  "var(--plan-foreground)",
]

export function StudyOutputChart({
  output,
  onCitation,
}: {
  output: ChartOutput
  onCitation: (citation: StudyOutputCitation) => void
}) {
  const reducedMotion = useReducedMotion()
  const labels = [
    ...new Set(
      output.series.flatMap((series) =>
        series.points.map((point) => point.label)
      )
    ),
  ]
  const data = labels.map((label) => ({
    label,
    ...Object.fromEntries(
      output.series.map((series, index) => [
        `series${index}`,
        series.points.find((point) => point.label === label)?.value ?? null,
      ])
    ),
  }))
  const config: ChartConfig = Object.fromEntries(
    output.series.map((series, index) => [
      `series${index}`,
      { label: series.name, color: colors[index] },
    ])
  )
  const axes = (
    <>
      <CartesianGrid vertical={false} />
      <XAxis
        dataKey="label"
        tickLine={false}
        axisLine={false}
        minTickGap={16}
        label={{ value: output.xLabel, position: "insideBottom", offset: -18 }}
      />
      <YAxis
        tickLine={false}
        axisLine={false}
        width={55}
        label={{ value: output.yLabel, angle: -90, position: "insideLeft" }}
      />
      <ChartTooltip content={<ChartTooltipContent />} />
      <ChartLegend
        verticalAlign="top"
        height={36}
        content={<ChartLegendContent verticalAlign="top" />}
      />
    </>
  )
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="rounded-[20px] border px-2 pt-5 pb-3 sm:px-4">
        <ChartContainer
          config={config}
          className="h-80 w-full"
          aria-label={`${output.title}${output.unit ? ` (${output.unit})` : ""}`}
        >
          {output.kind === "bar-chart" ? (
            <BarChart
              data={data}
              accessibilityLayer
              margin={{ top: 10, right: 10, bottom: 24, left: 8 }}
            >
              {axes}
              {output.series.map((series, index) => (
                <Bar
                  key={index}
                  dataKey={`series${index}`}
                  name={series.name}
                  fill={colors[index]}
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={!reducedMotion}
                  animationDuration={180}
                />
              ))}
            </BarChart>
          ) : (
            <LineChart
              data={data}
              accessibilityLayer
              margin={{ top: 10, right: 10, bottom: 24, left: 8 }}
            >
              {axes}
              {output.series.map((series, index) => (
                <Line
                  key={index}
                  type="linear"
                  dataKey={`series${index}`}
                  name={series.name}
                  stroke={colors[index]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls={false}
                  isAnimationActive={!reducedMotion}
                  animationDuration={180}
                />
              ))}
            </LineChart>
          )}
        </ChartContainer>
      </div>
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">
          Values and supporting sources{output.unit ? ` · ${output.unit}` : ""}
        </h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Series</TableHead>
              <TableHead>{output.xLabel || "Label"}</TableHead>
              <TableHead className="text-right">
                {output.yLabel || "Value"}
              </TableHead>
              <TableHead>Sources</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {output.series.flatMap((series, seriesIndex) =>
              series.points.map((point, index) => (
                <TableRow key={`${seriesIndex}:${index}`}>
                  <TableCell>{series.name}</TableCell>
                  <TableCell>{point.label}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {point.value.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <StudyOutputCitations
                      citations={point.citations}
                      onCitation={onCitation}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  )
}
