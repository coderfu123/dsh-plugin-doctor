import type { CheckResult, PluginReport } from './types.js'

/** Use colour only when a human is likely watching. Piped output stays clean. */
export function shouldUseColor(force: boolean | null): boolean {
  if (force !== null) return force
  return process.stdout.isTTY === true && process.env['NO_COLOR'] === undefined
}

const ANSI = {
  reset: '\u001b[0m',
  dim: '\u001b[2m',
  red: '\u001b[31m',
  yellow: '\u001b[33m',
  green: '\u001b[32m',
  bold: '\u001b[1m',
} as const

const STATUS_STYLE = {
  pass: { symbol: 'PASS', color: ANSI.green },
  warn: { symbol: 'WARN', color: ANSI.yellow },
  fail: { symbol: 'FAIL', color: ANSI.red },
} as const

function paint(text: string, color: string, useColor: boolean): string {
  return useColor ? `${color}${text}${ANSI.reset}` : text
}

function renderResult(result: CheckResult, useColor: boolean): string[] {
  const style = STATUS_STYLE[result.status]
  const tag = paint(style.symbol, style.color, useColor)
  const lines = [`  ${tag}  ${result.checkId}${useColor ? ANSI.dim : ''}  ${result.message}${useColor ? ANSI.reset : ''}`]

  for (const detail of result.details ?? []) {
    lines.push(`        ${paint(detail, ANSI.dim, useColor)}`)
  }

  return lines
}

/** Human-readable report. */
export function renderText(report: PluginReport, useColor: boolean): string {
  const lines: string[] = []
  const heading = `${report.name}@${report.version}`
  lines.push(`${paint(heading, ANSI.bold, useColor)}  score ${report.score}/100`)
  lines.push(paint(report.dir, ANSI.dim, useColor))
  lines.push('')

  for (const result of report.results) {
    lines.push(...renderResult(result, useColor))
  }

  const failed = report.results.filter((r) => r.status === 'fail').length
  const warned = report.results.filter((r) => r.status === 'warn').length
  lines.push('')
  lines.push(paint(`${report.results.length} checks: ${failed} fail, ${warned} warn`, ANSI.dim, useColor))

  return lines.join('\n')
}

/** Machine-readable report. Shape is stable; add fields, never repurpose them. */
export function renderJson(report: PluginReport): string {
  return JSON.stringify(report, null, 2)
}
