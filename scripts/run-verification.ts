/* eslint-disable no-console */
import { exec } from 'node:child_process'
import { promisify, styleText } from 'node:util'

const execAsync = promisify(exec)

interface IVerificationResult {
    name: string
    passed: boolean
    duration: number
    error?: string
    details?: Record<string, unknown>
}

interface ITestSuiteReport {
    suites?: Array<{
        specs?: Array<{
            ok: boolean
            title: string
        }>
    }>
}

class VerificationRunner {
    private readonly results: IVerificationResult[] = []
    
    async runAll(): Promise<boolean> {
        // eslint-disable-next-line no-console
        console.info(styleText(['bold', 'blue'], '\n🔍 Running Observatory Verification Suite v1.0\n'))
        
        const testSuites: string[] = [
            'trace-viewer',
            'render-heatmap', 
            'composable-tracker',
            'pinia-tracker',
            'provide-inject',
            'transition-tracker',
            'fetch-dashboard'
        ]
        
        await testSuites.reduce(
            (previous, suite) => previous.then(() => this.runTestSuite(suite)),
            Promise.resolve(),
        )
        
        this.printReport()

        return this.results.every((result: IVerificationResult) => result.passed)
    }
    
    private async runTestSuite(suite: string): Promise<void> {
        // eslint-disable-next-line no-console
        console.info(styleText('yellow', `\n📋 Running ${suite} tests...`))
        
        try {
            const start: number = performance.now()
            const { stdout, stderr } = await execAsync(
                `pnpm playwright test --config tests/verification/playwright.config.ts tests/verification/${suite}.spec.ts --reporter=json`
            )
            const duration: number = performance.now() - start
            
            let report: ITestSuiteReport = {}
            let passed: boolean = false
            
            try {
                report = JSON.parse(stdout) as ITestSuiteReport
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
                console.info(styleText('green', `✅ ${suite} passed (${duration.toFixed(2)}ms)`))
            } else {
                console.info(styleText('red', `❌ ${suite} failed`))

                if (stderr) {
                    console.error(styleText('red', stderr))
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

            console.error(styleText('red', `❌ ${suite} failed to run: ${errorMessage}`))
        }
    }
    
    private printReport(): void {
        console.info(styleText(['bold', 'blue'], '\n📊 Verification Report\n'))

        console.info(styleText('bold', '┌─────────────┬────────┬────────────┬──────────────────────────────┐'))
        console.info(styleText('bold', '│ Test Suite  │ Status │ Duration   │ Error                        │'))
        console.info(styleText('bold', '├─────────────┼────────┼────────────┼──────────────────────────────┤'))
        
        for (const result of this.results) {
            const statusText: string = result.passed ? '✅ PASS' : '❌ FAIL'
            const durationText: string = `${result.duration.toFixed(2)}ms`
            const errorText: string = result.error ? result.error.substring(0, 28) : '-'

            console.info(
                `│ ${result.name.padEnd(11)} │ ${statusText.padEnd(6)} │ ${durationText.padEnd(10)} │ ${errorText.padEnd(28)} │`
            )
        }

        console.info(styleText('bold', '└─────────────┴────────┴────────────┴──────────────────────────────┘'))

        const totalPassed: number = this.results.filter((r: IVerificationResult) => r.passed).length
        const totalFailed: number = this.results.filter((r: IVerificationResult) => !r.passed).length
        const totalTests: number = this.results.length

        console.info(styleText('bold', `\nSummary: ${totalPassed} passed, ${totalFailed} failed (${totalTests} total)\n`))
        
        if (totalFailed === 0) {
            console.info(styleText(['bold', 'green'], '🎉 All verification tests passed! Observatory data is accurate.'))
        } else {
            console.info(styleText(['bold', 'red'], `⚠️ ${totalFailed} test suites failed. Review the errors above.`))
        }
    }
}

// Run verification
const runner: VerificationRunner = new VerificationRunner()

try {
    const success: boolean = await runner.runAll()
    process.exit(success ? 0 : 1)
} catch (error: unknown) {
    console.error(error)
    process.exit(1)
}