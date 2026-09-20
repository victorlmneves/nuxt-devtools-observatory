import { spawnSync } from 'node:child_process'

const scope = process.argv[2] || 'root'
if (!['root', 'docs', 'all'].includes(scope)) {
  console.error('Usage: node scripts/audit-scope.mjs <root|docs|all>')
  process.exit(2)
}

const run = spawnSync('pnpm', ['audit', '--json'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
})

const raw = (run.stdout || '').trim()
if (!raw) {
  console.error(run.stderr || 'pnpm audit produced no JSON output')
  process.exit(2)
}

let report
try {
  report = JSON.parse(raw)
}
catch (error) {
  console.error('Failed to parse pnpm audit JSON output')
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(2)
}

const advisories = Object.values(report.advisories || {})

function isDocsPath(path) {
  return path.startsWith('docs>')
}

const scoped = []
for (const advisory of advisories) {
  const findings = advisory.findings || []
  const matchedPaths = []

  for (const finding of findings) {
    for (const path of finding.paths || []) {
      const docsPath = isDocsPath(path)
      if (scope === 'all' || (scope === 'docs' && docsPath) || (scope === 'root' && !docsPath)) {
        matchedPaths.push(path)
      }
    }
  }

  if (matchedPaths.length > 0) {
    scoped.push({ advisory, paths: matchedPaths })
  }
}

const severityTotals = { low: 0, moderate: 0, high: 0, critical: 0 }
for (const item of scoped) {
  const severity = item.advisory.severity
  if (severityTotals[severity] !== undefined) {
    severityTotals[severity] += 1
  }
}

if (scoped.length === 0) {
  console.log(`No vulnerabilities found for scope: ${scope}`)
  process.exit(0)
}

console.log(`Vulnerabilities for scope: ${scope}`)
for (const item of scoped) {
  console.log(`- [${item.advisory.severity}] ${item.advisory.module_name} (${item.advisory.github_advisory_id || item.advisory.id})`)
  for (const p of item.paths) {
    console.log(`  path: ${p}`)
  }
}

console.log('Summary:', severityTotals)

// CI fails only when scoped vulnerabilities exist.
process.exit(1)
