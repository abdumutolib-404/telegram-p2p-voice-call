// Reuse the reviewed isolation launcher with this mission's own image tag.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const filename=path.resolve(__dirname,'../../scripts/start-isolated-container.cjs');
let source=fs.readFileSync(filename,'utf8');
const expected="const image = 'pairtalk-whole-audit:local';";
assert.equal(source.split(expected).length,2,'Isolation launcher changed; review before use');
source=source.replace(expected,"const image = 'pairtalk-qa-20261004:local';");
const loaded=new Module(filename,module);loaded.filename=filename;loaded.paths=Module._nodeModulePaths(path.dirname(filename));loaded._compile(source,filename);
