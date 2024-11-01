var assert = require('assert');
var mix = require('../src/index.js');
const path = require('path');
const fs = require('fs');

describe('mix', function() {
  describe('Mix', function() {
    describe('#build', function() {
      this.timeout(5000);
      it('should build and run the program', function() {
        let mp = new mix.Mix(path.join(__dirname, 'test.mixl'), {noinfo: true, stdout: false});
        mp.build().then(res => {
          assert.equal(res, "test\n1\ntest py 1\n2\n2\n4");
        })
      })
    })
    describe('#validateLanguages', function() {
      it('should validate the languages', async function() {
        let mp = new mix.Mix(path.join(__dirname, 'test.mixl'), {noinfo: true});
        let code = await fs.promises.readFile(mp.filePath, "utf8");
        assert.doesNotReject(mp.validateLanguages(code));
      })
    })
    describe('#segmentSeparation', function() {
      it('should separate code into segments', async function() {
        let mp = new mix.Mix(path.join(__dirname, 'test.mixl'), {noinfo: true});
        let code = await fs.promises.readFile(mp.filePath, "utf8");
        assert.doesNotReject(mp.segmentSeparation(code));
      })
    })
  })
  describe('Parser', function() {
    describe('#parseLine', function() {
      it('should parse a line and return variables', async function() {
        assert.deepEqual(await mix.Parser.parseLine("let a = 1", "js"), {variablesDefined: [{identifier: "a", value: "1"}]});
        assert.deepEqual(await mix.Parser.parseLine("const a = 1", "js"), {variablesDefined: [{identifier: "a", value: "1"}]});
        assert.deepEqual(await mix.Parser.parseLine("a = 1", "py"), {variablesDefined: [{identifier: "a", value: "1"}]});
      })
    })
    describe('#parseCodeSegment', function() {
      it('should parse a code segment and apply variables to globals', async function() {
        let mp = new mix.Mix(path.join(__dirname, 'test.mixl'), {noinfo: true});
        let globals = {};
        assert.doesNotReject(mix.Parser.parseCodeSegment("let a = 1", "js", globals));
      })
    })
  })
  describe('Compiler', function() {
    describe('#prepCodeSegment', function() {
      it('should prepare a code segment for run', function() {
        let mp = new mix.Mix(path.join(__dirname, 'test.mixl'), {noinfo: true});
        let code = "let a = 1";
        assert.doesNotReject(mix.Compiler.prepCodeSegment(code, "js", {}));
      })
    })
  })
})