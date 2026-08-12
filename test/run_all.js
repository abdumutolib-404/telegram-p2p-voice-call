/**
 * test/run_all.js
 * Unified test runner executing all tier test suites (Tier 1-4).
 * Produces formatted summary tables per tier and calculates total pass/fail status.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const TIERS = [
  { id: 'tier1', name: 'TIER 1: PROTOCOL TESTS', dir: path.join(__dirname, 'tier1_protocol') },
  { id: 'tier2', name: 'TIER 2: API & SOCKET INTEGRATION TESTS', dir: path.join(__dirname, 'tier2_api_socket') },
  { id: 'tier3', name: 'TIER 3: WORKFLOW & STATE INTEGRATION TESTS', dir: path.join(__dirname, 'tier3_workflows') },
  { id: 'tier4', name: 'TIER 4: REQUIREMENT-DRIVEN OPAQUE-BOX E2E TESTS', dir: path.join(__dirname, 'tier4_opaque_e2e') }
];

function discoverTestFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const files = fs.readdirSync(dirPath);
  return files
    .filter(file => file.endsWith('.test.js') || file.endsWith('.spec.js'))
    .map(file => path.join(dirPath, file));
}

function runSingleTestFile(filePath) {
  const startTime = Date.now();
  const relPath = path.relative(__dirname, filePath).replace(/\\/g, '/');

  const result = spawnSync(process.execPath, [filePath], {
    cwd: path.dirname(__dirname),
    env: { ...process.env, NODE_ENV: 'test' },
    encoding: 'utf8',
    timeout: 30000
  });

  const duration = Date.now() - startTime;
  const passed = result.status === 0;

  // Try to parse count of individual assertions/tests if reported in output
  let testCount = 1;
  if (result.stdout) {
    const match = result.stdout.match(/(\d+)\s+passed/i) || result.stdout.match(/Tests:\s*(\d+)/i);
    if (match) {
      testCount = parseInt(match[1], 10);
    }
  }

  return {
    filePath,
    relPath,
    passed,
    duration,
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    testCount
  };
}

function runAll() {
  console.log('\n======================================================================');
  console.log('       IELTS SPEAKING P2P MATCHMAKING & VOICE CALL TEST SUITE       ');
  console.log('======================================================================\n');

  let totalFilesRun = 0;
  let totalPassedFiles = 0;
  let totalFailedFiles = 0;
  let totalAssertions = 0;
  const startTime = Date.now();
  const tierResults = [];

  for (const tier of TIERS) {
    console.log(`======================================================================`);
    console.log(`                     ${tier.name}`);
    console.log(`======================================================================`);

    const testFiles = discoverTestFiles(tier.dir);

    if (testFiles.length === 0) {
      console.log(`  [INFO] No test files found in ${path.relative(__dirname, tier.dir)}/ (Pending Implementation)`);
      console.log(`----------------------------------------------------------------------\n`);
      tierResults.push({ tier, fileResults: [], passedCount: 0, failedCount: 0 });
      continue;
    }

    console.log(`| STATUS | DURATION | FILE`);
    console.log(`|--------|----------|-------------------------------------------------`);

    let tierPassed = 0;
    let tierFailed = 0;
    const fileResults = [];

    for (const file of testFiles) {
      const res = runSingleTestFile(file);
      fileResults.push(res);
      totalFilesRun++;
      totalAssertions += res.testCount;

      const statusStr = res.passed ? 'PASS  ' : 'FAIL  ';
      const durStr = `${res.duration}ms`.padStart(8);
      console.log(`| ${statusStr} | ${durStr} | ${res.relPath}`);

      if (res.passed) {
        tierPassed++;
        totalPassedFiles++;
      } else {
        tierFailed++;
        totalFailedFiles++;
        if (res.stderr || res.stdout) {
          console.log(`  ---> ERROR OUTPUT FOR ${res.relPath}:`);
          const errLines = (res.stderr || res.stdout).split('\n').slice(0, 10).join('\n    ');
          console.log(`    ${errLines}`);
        }
      }
    }

    console.log(`----------------------------------------------------------------------`);
    const tierTestCount = fileResults.reduce((sum, r) => sum + r.testCount, 0);
    console.log(`  Tier Subtotal: ${tierPassed} passed, ${tierFailed} failed (${tierTestCount} test cases)\n`);

    tierResults.push({ tier, fileResults, passedCount: tierPassed, failedCount: tierFailed, testCount: tierTestCount });
  }

  const totalDuration = Date.now() - startTime;

  console.log(`======================================================================`);
  console.log(`                          EXECUTION SUMMARY                           `);
  console.log(`======================================================================`);
  for (const tr of tierResults) {
    const statusLabel = tr.fileResults.length === 0 
      ? 'NO TESTS ' 
      : `${tr.passedCount}/${tr.fileResults.length} Files Passed (${tr.testCount} test cases)`;
    console.log(`  ${tr.tier.name.padEnd(45)}: ${statusLabel}`);
  }
  console.log(`----------------------------------------------------------------------`);
  console.log(`  Total Test Files Run : ${totalFilesRun}`);
  console.log(`  Passed Test Files    : ${totalPassedFiles}`);
  console.log(`  Failed Test Files    : ${totalFailedFiles}`);
  console.log(`  Total Test Cases     : ${totalAssertions}`);
  console.log(`  Pass Rate            : ${totalFilesRun > 0 ? ((totalPassedFiles / totalFilesRun) * 100).toFixed(1) : 0}%`);
  console.log(`  Total Duration       : ${totalDuration}ms`);
  console.log(`======================================================================\n`);

  if (totalFailedFiles > 0) {
    console.log(`❌ TEST SUITE FAILED: ${totalFailedFiles} file(s) failed.`);
    process.exit(1);
  } else {
    console.log(`✅ TEST SUITE PASSED: All executed tests completed cleanly.`);
    process.exit(0);
  }
}

if (require.main === module) {
  runAll();
}

module.exports = {
  discoverTestFiles,
  runSingleTestFile,
  runAll
};
