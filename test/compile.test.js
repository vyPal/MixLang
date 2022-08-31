var assert = require('assert');
var mixl = require('../src/index.js');

describe('MixProgram', function() {
  describe('#read', function () {
    it('should return the file contents', function() {
      let fs = require('fs');
      let path = require('path');
      var program = new mixl.MixProgram('test/test.mixl');
      assert.equal(program.read(), fs.readFileSync(path.join(__dirname, './test.mixl'), 'utf8'));
    })
  })
  describe('#load', function() {
    it('should load the program', async function() {
      let prog = new mixl.MixProgram('./test/test.mixl');
      let res = await prog.load();
      assert.deepStrictEqual(res, {
        js: 'let x = "hello world";\nconsole.log("test 1")\nconsole.log("test 2")\nconsole.log("test 4")',
        py: 'print("test 3")\nprint(x)'
      });
    })
  })
  describe('#exec', function() {
    it('should execute the program', async function() {
      let prog = new mixl.MixProgram('./test/test.mixl');
      await prog.load();
      let res = await prog.exec();
      assert.equal(res, 'test 1\ntest 2\ntest 3\nhello world\ntest 4\n');
    }).timeout(5000);
  })
})