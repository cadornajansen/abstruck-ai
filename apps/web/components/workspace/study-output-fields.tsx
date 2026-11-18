"use client"

import { useId, type ChangeEvent } from "react"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  Field,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@workspace/ui/components/field"
import type {
  ChartOutput,
  GraphOutput,
  InteractiveOutput,
  StudyOutputContent,
  TimelineOutput,
} from "@/lib/study-output-types"

export type EditableStudyOutput = Exclude<
  StudyOutputContent,
  { kind: "podcast" | "video" }
>

export function OutputTextField({
  label,
  value,
  onChange,
  maxLength,
  multiline = false,
  optional = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  maxLength: number
  multiline?: boolean
  optional?: boolean
}) {
  const id = useId()
  const props = {
    id,
    value,
    maxLength,
    required: !optional,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(event.target.value),
  }
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {multiline ? (
        <Textarea {...props} className="min-h-24 resize-y rounded-xl" />
      ) : (
        <Input {...props} className="rounded-xl" />
      )}
    </Field>
  )
}

function GraphFields({
  output,
  onChange,
}: {
  output: GraphOutput
  onChange: (value: GraphOutput) => void
}) {
  function updateNode(
    index: number,
    patch: Partial<GraphOutput["nodes"][number]>
  ) {
    onChange({
      ...output,
      nodes: output.nodes.map((node, position) =>
        position === index ? { ...node, ...patch } : node
      ),
    })
  }
  return (
    <>
      {output.nodes.map((node, index) => (
        <FieldSet key={node.id} className="rounded-xl border p-4">
          <FieldLegend className="text-sm">Topic {index + 1}</FieldLegend>
          <OutputTextField
            label="Label"
            value={node.label}
            maxLength={140}
            onChange={(label) => updateNode(index, { label })}
          />
          <OutputTextField
            label="Detail"
            value={node.detail}
            maxLength={500}
            multiline
            optional
            onChange={(detail) => updateNode(index, { detail })}
          />
        </FieldSet>
      ))}
      {output.edges.map((edge, index) => (
        <OutputTextField
          key={`${edge.from}:${edge.to}:${index}`}
          label={`Connection ${index + 1} label`}
          value={edge.label}
          maxLength={100}
          optional
          onChange={(label) =>
            onChange({
              ...output,
              edges: output.edges.map((item, position) =>
                position === index ? { ...item, label } : item
              ),
            })
          }
        />
      ))}
    </>
  )
}

function TimelineFields({
  output,
  onChange,
}: {
  output: TimelineOutput
  onChange: (value: TimelineOutput) => void
}) {
  function updateEvent(
    index: number,
    patch: Partial<TimelineOutput["events"][number]>
  ) {
    onChange({
      ...output,
      events: output.events.map((event, position) =>
        position === index ? { ...event, ...patch } : event
      ),
    })
  }
  return (
    <>
      {output.events.map((event, index) => (
        <FieldSet key={event.id} className="rounded-xl border p-4">
          <FieldLegend className="text-sm">Event {index + 1}</FieldLegend>
          <OutputTextField
            label="Date or stage"
            value={event.date}
            maxLength={80}
            onChange={(date) => updateEvent(index, { date })}
          />
          <OutputTextField
            label="Label"
            value={event.label}
            maxLength={140}
            onChange={(label) => updateEvent(index, { label })}
          />
          <OutputTextField
            label="Detail"
            value={event.detail}
            maxLength={500}
            multiline
            onChange={(detail) => updateEvent(index, { detail })}
          />
        </FieldSet>
      ))}
    </>
  )
}

function ChartFields({
  output,
  onChange,
}: {
  output: ChartOutput
  onChange: (value: ChartOutput) => void
}) {
  const id = useId()
  function updatePoint(seriesIndex: number, pointIndex: number, value: number) {
    onChange({
      ...output,
      series: output.series.map((series, position) =>
        position === seriesIndex
          ? {
              ...series,
              points: series.points.map((point, index) =>
                index === pointIndex ? { ...point, value } : point
              ),
            }
          : series
      ),
    })
  }
  function updatePointLabel(pointIndex: number, label: string) {
    onChange({
      ...output,
      series: output.series.map((series) => ({
        ...series,
        points: series.points.map((point, index) =>
          index === pointIndex ? { ...point, label } : point
        ),
      })),
    })
  }
  return (
    <>
      <OutputTextField
        label="Horizontal axis"
        value={output.xLabel}
        maxLength={120}
        onChange={(xLabel) => onChange({ ...output, xLabel })}
      />
      <OutputTextField
        label="Vertical axis"
        value={output.yLabel}
        maxLength={120}
        onChange={(yLabel) => onChange({ ...output, yLabel })}
      />
      <OutputTextField
        label="Unit"
        value={output.unit}
        maxLength={80}
        optional
        onChange={(unit) => onChange({ ...output, unit })}
      />
      {output.series.map((series, seriesIndex) => (
        <FieldSet key={seriesIndex} className="rounded-xl border p-4">
          <FieldLegend className="text-sm">
            Series {seriesIndex + 1}
          </FieldLegend>
          <OutputTextField
            label="Series name"
            value={series.name}
            maxLength={100}
            onChange={(name) =>
              onChange({
                ...output,
                series: output.series.map((item, position) =>
                  position === seriesIndex ? { ...item, name } : item
                ),
              })
            }
          />
          {series.points.map((point, pointIndex) => (
            <div key={pointIndex} className="grid grid-cols-2 gap-3">
              <OutputTextField
                label={`Point ${pointIndex + 1} label`}
                value={point.label}
                maxLength={120}
                onChange={(label) => updatePointLabel(pointIndex, label)}
              />
              <Field>
                <FieldLabel htmlFor={`${id}-${seriesIndex}-${pointIndex}`}>
                  Value
                </FieldLabel>
                <Input
                  id={`${id}-${seriesIndex}-${pointIndex}`}
                  type="number"
                  step="any"
                  required
                  value={Number.isFinite(point.value) ? point.value : ""}
                  aria-invalid={!Number.isFinite(point.value)}
                  onChange={(event) =>
                    updatePoint(
                      seriesIndex,
                      pointIndex,
                      event.target.valueAsNumber
                    )
                  }
                />
              </Field>
            </div>
          ))}
        </FieldSet>
      ))}
    </>
  )
}

function PracticeFields({
  output,
  onChange,
}: {
  output: InteractiveOutput
  onChange: (value: InteractiveOutput) => void
}) {
  function updateStep(
    index: number,
    patch: Partial<InteractiveOutput["steps"][number]>
  ) {
    onChange({
      ...output,
      steps: output.steps.map((step, position) =>
        position === index ? { ...step, ...patch } : step
      ),
    })
  }
  return (
    <>
      {output.steps.map((step, index) => (
        <FieldSet key={step.id} className="rounded-xl border p-4">
          <FieldLegend className="text-sm">
            Practice step {index + 1}
          </FieldLegend>
          <OutputTextField
            label="Prompt"
            value={step.prompt}
            maxLength={500}
            multiline
            onChange={(prompt) => updateStep(index, { prompt })}
          />
          {step.choices.map((choice, choiceIndex) => (
            <OutputTextField
              key={choice.id}
              label={`Choice ${choiceIndex + 1}${choice.id === step.correctChoiceId ? " (saved answer)" : ""}`}
              value={choice.text}
              maxLength={300}
              onChange={(text) =>
                updateStep(index, {
                  choices: step.choices.map((option) =>
                    option.id === choice.id ? { ...option, text } : option
                  ),
                })
              }
            />
          ))}
          <OutputTextField
            label="Explanation"
            value={step.explanation}
            maxLength={700}
            multiline
            onChange={(explanation) => updateStep(index, { explanation })}
          />
          <OutputTextField
            label="Hint"
            value={step.hint}
            maxLength={300}
            multiline
            optional
            onChange={(hint) => updateStep(index, { hint })}
          />
        </FieldSet>
      ))}
    </>
  )
}

export function StudyOutputFields({
  output,
  onChange,
}: {
  output: EditableStudyOutput
  onChange: (value: EditableStudyOutput) => void
}) {
  if (output.kind === "mind-map" || output.kind === "flowchart")
    return <GraphFields output={output} onChange={onChange} />
  if (output.kind === "timeline")
    return <TimelineFields output={output} onChange={onChange} />
  if (output.kind === "bar-chart" || output.kind === "line-chart")
    return <ChartFields output={output} onChange={onChange} />
  if (output.kind === "interactive")
    return <PracticeFields output={output} onChange={onChange} />
  return null
}
