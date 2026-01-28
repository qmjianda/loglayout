// 性能测试工具 - 用于验证优化效果
// 在浏览器控制台中运行此脚本

interface PerformanceResult {
    name: string;
    duration: number;
    memoryBefore: number;
    memoryAfter: number;
    memoryDelta: number;
}

class LogLayerPerformanceTester {
    private results: PerformanceResult[] = [];

    // 生成测试数据
    generateTestLogs(count: number): string[] {
        const levels = ['INFO', 'WARN', 'ERROR', 'DEBUG', 'FATAL'];
        const messages = [
            'Application started successfully',
            'Database connection established',
            'User authentication failed',
            'Request processing completed',
            'Cache invalidated',
            'Memory usage: 85%',
            'Network timeout occurred',
            'Transaction committed'
        ];

        const logs: string[] = [];
        for (let i = 0; i < count; i++) {
            const timestamp = new Date(Date.now() - (count - i) * 1000).toISOString();
            const level = levels[Math.floor(Math.random() * levels.length)];
            const message = messages[Math.floor(Math.random() * messages.length)];
            logs.push(`[${timestamp}] ${level}: ${message} (line ${i + 1})`);
        }
        return logs;
    }

    // 获取内存使用情况
    getMemoryUsage(): number {
        // @ts-ignore - performance.memory is a non-standard API available in Chrome
        if (performance.memory) {
            // @ts-ignore
            return performance.memory.usedJSHeapSize / 1024 / 1024; // MB
        }
        return 0;
    }

    // 运行性能测试
    async runTest(name: string, testFn: () => void | Promise<void>): Promise<PerformanceResult> {
        // 强制垃圾回收（如果可用）
        if (global.gc) {
            global.gc();
        }

        const memoryBefore = this.getMemoryUsage();
        const startTime = performance.now();

        await testFn();

        const endTime = performance.now();
        const memoryAfter = this.getMemoryUsage();

        const result: PerformanceResult = {
            name,
            duration: endTime - startTime,
            memoryBefore,
            memoryAfter,
            memoryDelta: memoryAfter - memoryBefore
        };

        this.results.push(result);
        return result;
    }

    // 打印结果
    printResults() {
        console.log('\n=== LogLayer Performance Test Results ===\n');
        console.table(this.results.map(r => ({
            'Test Name': r.name,
            'Duration (ms)': r.duration.toFixed(2),
            'Memory Before (MB)': r.memoryBefore.toFixed(2),
            'Memory After (MB)': r.memoryAfter.toFixed(2),
            'Memory Delta (MB)': r.memoryDelta.toFixed(2)
        })));

        // 计算总体统计
        const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);
        const avgDuration = totalDuration / this.results.length;
        const totalMemory = this.results.reduce((sum, r) => sum + r.memoryDelta, 0);

        console.log('\n=== Summary ===');
        console.log(`Total Duration: ${totalDuration.toFixed(2)} ms`);
        console.log(`Average Duration: ${avgDuration.toFixed(2)} ms`);
        console.log(`Total Memory Delta: ${totalMemory.toFixed(2)} MB`);
    }

    // 清空结果
    clearResults() {
        this.results = [];
    }
}

// 测试场景
async function runPerformanceTests() {
    const tester = new LogLayerPerformanceTester();

    console.log('🚀 Starting LogLayer Performance Tests...\n');

    // 测试 1: 小数据集 (1K 行)
    console.log('📊 Test 1: Small dataset (1K lines)');
    const smallLogs = tester.generateTestLogs(1000);
    await tester.runTest('1K lines - Filter', () => {
        // 模拟过滤操作
        const filtered = smallLogs.filter(line => line.includes('ERROR'));
    });

    // 测试 2: 中等数据集 (100K 行)
    console.log('📊 Test 2: Medium dataset (100K lines)');
    const mediumLogs = tester.generateTestLogs(100000);
    await tester.runTest('100K lines - Filter', () => {
        const filtered = mediumLogs.filter(line => line.includes('ERROR'));
    });

    // 测试 3: 大数据集 (1M 行)
    console.log('📊 Test 3: Large dataset (1M lines)');
    const largeLogs = tester.generateTestLogs(1000000);
    await tester.runTest('1M lines - Filter', () => {
        const filtered = largeLogs.filter(line => line.includes('ERROR'));
    });

    // 测试 4: 对象化性能
    console.log('📊 Test 4: Objectification performance');
    await tester.runTest('100K lines - Objectify', () => {
        const objects = mediumLogs.map((line, i) => ({ index: i, content: line }));
    });

    // 测试 5: 正则表达式匹配
    console.log('📊 Test 5: Regex matching');
    const regex = /ERROR|WARN|FATAL/gi;
    await tester.runTest('100K lines - Regex', () => {
        mediumLogs.forEach(line => {
            regex.lastIndex = 0; // 重置状态
            regex.test(line);
        });
    });

    // 打印结果
    tester.printResults();

    return tester;
}

// 导出测试工具
if (typeof window !== 'undefined') {
    (window as any).LogLayerPerformanceTester = LogLayerPerformanceTester;
    (window as any).runPerformanceTests = runPerformanceTests;
    console.log('✅ Performance testing tools loaded!');
    console.log('Run: await runPerformanceTests()');
}

export { LogLayerPerformanceTester, runPerformanceTests };
