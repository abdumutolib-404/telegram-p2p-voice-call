// Offline tests of Fly's retained ENTRYPOINT and replaced CMD. No provider access.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const image = process.argv[2] || 'pairtalk-fly-staging:local';
if (!/^pairtalk-(fly-staging|whole-audit|qa-\d+):local$/.test(image)) throw new Error('Use an owned local verification image.');
function run(release, args) {
  const result = spawnSync('docker', ['run', '--rm', '--network', 'none', '--read-only',
    '-e', 'RELEASE_COMMAND=' + release, image, ...args], { encoding: 'utf8', timeout: 20000 });
  if (result.error) throw result.error;
  return result;
}
const noServices = 'if ps -o comm | grep -Eq "^(node|gateway)$"; then exit 99; fi; ';
const success = run('1', ['/bin/sh', '-c', noServices + 'printf "release-only-success\\n"']);
assert.equal(success.status, 0);
assert.equal(success.stdout.trim(), 'release-only-success');
console.log('PASS release argv executes successfully without starting either service');
const failure = run('1', ['/bin/sh', '-c', noServices + 'exit 23']);
assert.equal(failure.status, 23);
assert(!failure.stdout.includes('[Startup]'));
console.log('PASS release failure preserves the command exit code without starting services');
const missing = run('1', []);
assert.equal(missing.status, 64);
assert(missing.stderr.includes('[Release] Missing release command.'));
console.log('PASS missing release command fails closed');
const ordinary = run('0', ['/bin/sh', '-c', 'echo should-not-run']);
assert.equal(ordinary.status, 64);
assert(!ordinary.stdout.includes('should-not-run'));
console.log('PASS ordinary boot does not execute migration or other command arguments');
