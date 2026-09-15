/* eslint-disable no-console */
import { exec } from 'child_process'
import { promisify } from 'util'
import chalk from 'chalk'

const execAsync = promisify(exec)

interface VerificationResult {
    name: string
    passed: boolean
    duration: number
    error?: string
    details?: Record<string, unknown>
}

interface TestSuiteReport {
    suites?: Array<{
        specs?: Array<{
            ok: boolean
            title: string
        }>
    }>
}

class VerificationRunner {
    private results: VerificationResult[] = []
    
    async runAll(): Promise<boolean> {
        // eslint-disable-next-line no-console
        console.info(chalk.bold.blue('\n🔍 Running Observatory Verification Suite v1.0\n'))
        
        const testSuites: string[] = [
            'trace-viewer',
            'render-heatmap', 
            'composable-tracker',
            'pinia-tracker',
            'provide-inject',
            'transition-tracker',
            'fetch-dashboard'
        ]
        
        for (const suite of testSuites) {
            await this.runTestSuite(suite)
        }
        
        this.printReport()

        return this.results.every((result: VerificationResult) => result.passed)
    }
    
    private async runTestSuite(suite: string): Promise<void> {
        // eslint-disable-next-line no-console
        console.info(chalk.yellow(`\n📋 Running ${suite} tests...`))
        
        try {
            const start: number = performance.now()
            const { stdout, stderr } = await execAsync(
                `pnpm playwright test --config tests/verification/playwright.config.ts tests/verification/${suite}.spec.ts --reporter=json`
            )
            const duration: number = performance.now() - start
            
            let report: TestSuiteReport = {}
            let passed: boolean = false
            
            try {
                report = JSON.parse(stdout) as TestSuiteReport
                passed = report.suites?.every((suiteItem: { specs?: Array<{ ok: boolean }> }) => 
                suiteItem.specs?.every((spec: { ok: boolean }) => spec.ok === true) ?? false) ?? false
            } catch {
                passed = stderr.length === 0
            }
            
            this.results.push({
                name: suite,
                passed,
                duration,
                details: report as Record<string, unknown>
            })
            
            if (passed) {
                console.info(chalk.green(`✅ ${suite} passed (${duration.toFixed(2)}ms)`))
            } else {
                console.info(chalk.red(`❌ ${suite} failed`))

                if (stderr) {
                    console.error(chalk.red(stderr))
                }
            }
        } catch (error: unknown) {
            const errorMessage: string = error instanceof Error ? error.message : String(error)
            this.results.push({
                name: suite,
                passed: false,
                duration: 0,
                error: errorMessage
            })

            console.error(chalk.red(`❌ ${suite} failed to run: ${errorMessage}`))
        }
    }
    
    private printReport(): void {
        console.info(chalk.bold.blue('\n📊 Verification Report\n'))

        console.info(chalk.bold('┌─────────────┬────────┬────────────┬──────────────────────────────┐'))
        console.info(chalk.bold('│ Test Suite  │ Status │ Duration   │ Error                        │'))
        console.info(chalk.bold('├─────────────┼────────┼────────────┼──────────────────────────────┤'))
        
        for (const result of this.results) {
            const statusText: string = result.passed ? '✅ PASS' : '❌ FAIL'
            const durationText: string = `${result.duration.toFixed(2)}ms`
            const errorText: string = result.error ? result.error.substring(0, 28) : '-'

            console.info(
                `│ ${result.name.padEnd(11)} │ ${statusText.padEnd(6)} │ ${durationText.padEnd(10)} │ ${errorText.padEnd(28)} │`
            )
        }

        console.info(chalk.bold('└─────────────┴────────┴────────────┴──────────────────────────────┘'))

        const totalPassed: number = this.results.filter((r: VerificationResult) => r.passed).length
        const totalFailed: number = this.results.filter((r: VerificationResult) => !r.passed).length
        const totalTests: number = this.results.length

        console.info(chalk.bold(`\nSummary: ${totalPassed} passed, ${totalFailed} failed (${totalTests} total)\n`))
        
        if (totalFailed === 0) {
            console.info(chalk.green.bold('🎉 All verification tests passed! Observatory data is accurate.'))
        } else {
            console.info(chalk.red.bold(`⚠️ ${totalFailed} test suites failed. Review the errors above.`))
        }
    }
}

// Run verification
const runner: VerificationRunner = new VerificationRunner()
runner.runAll().then((success: boolean): void => {
    process.exit(success ? 0 : 1)
})