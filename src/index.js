let fs = require('fs');
let path = require('path');
const { exec, spawn } = require('node:child_process');
const chalk = require('chalk');
const boxen = require('boxen');
const process = require('node:process')

let languages = {
  javascript: "js",
  python: "py"
}

class MixProgram {
  constructor(file) {
    this.file = file;
    this.rawCode = "";
    this.codeSegments = {};
    this.execOrd = [];
    this.globals = {};
  }

  read() {
    return fs.readFileSync(path.join(process.cwd(), this.file), 'utf8');
  }

  load() {
    let pr = new Promise((resolve, reject) => {
      this.rawCode = this.read();
      let codeSplit = this.rawCode.split("\r\n");
      let langs = [];
      for(const line of codeSplit) {
        if(/^\[\w*\]/g.test(line)) {
          let language = line.replace(/\[|\]/g, '');
          if(Object.values(languages).map(val => val.toUpperCase()).includes(language)) {
            if(!langs.includes(language))langs.push(language);
          }else {
            reject(new Error(`Language ${language} is not supported`));
          }
        }
      }
      let currentLang = "";
      let lineNumber = 0;
      for(const line of codeSplit) {
        lineNumber += 1;
        if(/^\[\w*\]/g.test(line)) {
          currentLang = line.replace(/\[|\]/g, '').toLowerCase();
        }else {
          if(line == "") break;
          if(currentLang !== "") {
            if(currentLang == "js") {
              if(/^(let|const|var)\s\w*\s*=\s*/g.test(line)) {
                let varName = line.replace(/^(let|const|var)\s(\w*)\s*/g, "$2").split("=")[0];
                let varValue = line.replace(/^(let|const|var)\s(\w*)\s*/g, "$2").split("=")[1].trim().replace(/;*/g, "");
                this.globals[varName] = varValue;
              }else if(/^\w*\s*=\s*/g.test(line)) {
                let varName = line.replace(/^(\w*)\s*/g, "$2").split("=")[0];
                let varValue = line.replace(/^(\w*)\s*/g, "$2").split("=")[1].trim().replace(/;*/g, "");
                if(this.globals.keys().includes(varName)) {
                  this.globals[varName] = varValue;
                }else {
                  reject(new Error(`Variable ${varName} on line ${lineNumber} was not previously defined`));
                }
              }
            }else if(currentLang == "py") {
              if(/^\w*\s*=\s*/g.test(line)) {
                let varName = line.replace(/^(\w*)\s*/g, "$1").split("=")[0];
                let varValue = line.replace(/^(\w*)\s*/g, "$1").split("=")[1].trim().replace(/;*/g, "");
                this.globals[varName] = varValue;
              }
            }
            this.codeSegments[currentLang] = this.codeSegments[currentLang] ? this.codeSegments[currentLang] + "\n" + line : line;
            this.execOrd.push({lang: currentLang, from: this.codeSegments[currentLang].split("\n").length - 1, to: this.codeSegments[currentLang].split("\n").length - 1});
          }else {
            reject(new Error("No language specified for line: " + line));
          }
        }
      }
      resolve(this.codeSegments);
    });
    return pr;
  }

  exec() {
    let pr = new Promise(async (resolve, reject) => {
      let out = "";
      let workingjs = 0;
      let workingpy = 0;
      for(const {lang, from, to} of this.execOrd) {
        if(lang == "js") workingjs += 1;
        if(lang == "py") workingpy += 1;
        if(from == to) {
          let code = "";
          let codeToFill = this.codeSegments[lang].split("\n")[from];
          for(const key of Object.keys(this.globals)) {
            if(lang == "js") {
              if(!codeToFill.includes(`${key} = ${this.globals[key]};`)) code += `let ${key} = ${this.globals[key]};\n`;
            }else if(lang == "py") {
              if(!codeToFill.includes(`${key} = ${this.globals[key]}`)) code += `${key} = ${this.globals[key]}\n`;
            }
          }
          code += codeToFill;
          let execute = new Promise(async (resolve, reject) =>{
            if(lang == "js") {
              if(!fs.existsSync(path.join(process.cwd(), "temp"))) {
                await fs.promises.mkdir(path.join(process.cwd(), "temp"));
              }
              fs.writeFile(path.join(process.cwd(), "temp", "code.js"), code, (error) => {
                if(error) reject(error);
                exec(`node ${path.join(process.cwd(), "temp", "code.js")}`, (err, stdout, stderr) => {
                  if(err) {
                    reject(err);
                  }else {
                    resolve(stdout);
                  }
                });
              });
            } else if(lang == "py") {
              if(!fs.existsSync(path.join(process.cwd(), "temp"))) {
                fs.mkdirSync(path.join(process.cwd(), "temp"));
              }
              fs.writeFile(path.join(process.cwd(), "temp", "code.py"), code, (error) => {
                if(error) reject(error);
                exec(`python ${path.join(process.cwd(), "temp", "code.py")}`, (err, stdout, stderr) => {
                  if(err) {
                    reject(err);
                  }else {
                    resolve(stdout);
                  }
                });
              });
            }
          })
          let res = await execute;
          out += res.replace(/\r\n|\n|\r/g, "\n");
          if(lang == "js") workingjs -= 1;
          if(lang == "py") workingpy -= 1;
        } else {
          reject(new Error("Multi-line execution (if statements, loops, etc) is not yet supported"));
        }
      }
      resolve(out);
    });
    return pr;
  }

}

let DEBUG = function(...args) {}
let c = chalk.green("✔ ");
let e = chalk.red("✖ ");
let w = chalk.yellow("⚠ ");
let i = chalk.blue("ⓘ ");
let d = chalk.magenta("➤ ");

let C = (...args) => { console.log(c+" "+args); }
let E = (...args) => { console.log(e+" "+args); }
let W = (...args) => { console.log(w+" "+args); }
let I = (...args) => { console.log(i+" "+args); }

let ora;

/**
 * Version 2.0
 */
class Mix {
  /**
   * @typedef {Object} MixOptions
   * @property {boolean} [build=false] - Build the file and run in non-interactive mode
   * @property {boolean} [run=false] - Build the file and run in interactive mode
   * @property {boolean} [debug=false] - Whether to print debug information
   * @property {boolean|ReadableStream|Stream} [stdin=false] - Readable stream or if mix should use process.stdin (run only)
   * @property {boolean|WritableStream|Stream} [stdout=true] - Writable stream or if mix should use process.stdout
   * @property {boolean} [instantOut=false] - If the output should be instantly printed to stdout (build only)
   * @property {boolean} [noinfo=false] - If true no info messages will be printed
   */
  /**
   * @constructor
   * @param {String} filePath - Full path to the file to be mixed
   * @param {MixOptions} opts - Options for mixing the file
   */
  constructor(filePath, opts = {}) {
    this.filePath = filePath;
    this.opts = Object.assign({}, {build: false, run: false, debug: false, stdin: false, stdout: true, instantOut: false, noinfo: false}, opts);
    this.stdin = this.opts.stdin;
    this.stdout = this.opts.stdout;
    if(this.stdin == true) this.stdin = process.stdin;
    if(this.stdout == true) this.stdout = process.stdout;
    if(this.opts.noinfo) {
      class EmptyOra {
        constructor() {}
        start(args) {return this}
        stop() {return this}
        succeed() {return this}
        succeed(args) {return this}
        fail(args) {return this}
        info(args) {return this}
        warn(args) {return this}
      }
      ora = function(args) {
        return new EmptyOra();
      }
    }else {
      ora = require("ora");
    }
    this.globals = {};
    if(this.opts.debug) DEBUG = (...args) => {console.log(d+" "+args)};
    if(this.opts.build) {
      DEBUG('Starting build...')
      this.build().catch((err) => {console.log(`\n${e} Build failed: \n${err}`);process.exit(1)})
      DEBUG(c+'Finished build.')
    }else if(this.opts.run) {
      DEBUG('Starting run...')
      this.run().catch((err) => {process.exit(1)})
      DEBUG(c+'Finished run.')
    }
  }

  /**
   * Builds the mix file
   * @returns {Promise<String>} - Information about how the building went
   */
  build() {
    let p = new Promise(async (resolve, reject) => {
      if(this.stdin != false) W("Stdin is not needed when building");
      let code = await fs.promises.readFile(this.filePath, "utf8");
      await this.validateLanguages(code).catch((err) => reject(err));
      let seg = await this.segmentSeparation(code).catch((err) => reject(err));
      let numSegmentsParsed = 0;
      for(const segment of seg) {
        numSegmentsParsed += 1;
        await Parser.parseCodeSegment(segment.code, segment.lang, this.globals, numSegmentsParsed, seg.length).catch((err) => reject(err));
      }
      let out = "";
      let numSegmentsRun = 0;
      for(const toRun of seg) {
        numSegmentsRun += 1;
        let spin = ora(`Running segment ${numSegmentsRun}/${seg.length}`).start();
        let execute = new Promise(async (resolve, reject) =>{
          let code = await Compiler.prepCodeSegment(toRun.code, toRun.lang, this.globals, numSegmentsRun, seg.length).catch((err) => reject(err));
          if(toRun.lang == "js") {
            if(!fs.existsSync(path.join(process.cwd(), "temp"))) {
              await fs.promises.mkdir(path.join(process.cwd(), "temp"));
            }
            fs.writeFile(path.join(process.cwd(), "temp", "code.js"), code, (error) => {
              if(error) reject(error);
              exec(`node ${path.join(process.cwd(), "temp", "code.js")}`, (err, stdout, stderr) => {
                if(err) {
                  reject(err);
                }else {
                  fs.readFile(path.join(process.cwd(), "temp", "out.json"), (err, data) => {
                    if(err) reject(err);
                    let jsonout = JSON.parse(data);
                    for(const key of Object.keys(jsonout)) {
                      if(typeof jsonout[key] == "string") this.globals[key] = "\""+jsonout[key]+"\"";
                      else this.globals[key] = jsonout[key];
                    }
                    if(this.opts.instantOut && this.stdout != false) this.stdout.write(stdout);
                    resolve(stdout);
                  });
                }
              });
            });
          } else if(toRun.lang == "py") {
            if(!fs.existsSync(path.join(process.cwd(), "temp"))) {
              fs.mkdirSync(path.join(process.cwd(), "temp"));
            }
            fs.writeFile(path.join(process.cwd(), "temp", "code.py"), code, (error) => {
              if(error) reject(error);
              exec(`python ${path.join(process.cwd(), "temp", "code.py")}`, (err, stdout, stderr) => {
                if(err) {
                  reject(err);
                }else {
                  fs.readFile(path.join(process.cwd(), "temp", "out.json"), (err, data) => {
                    if(err) reject(err);
                    let jsonout = JSON.parse(data);
                    for(const key of Object.keys(jsonout)) {
                      if(typeof jsonout[key] == "string") this.globals[key] = "\""+jsonout[key]+"\"";
                      else this.globals[key] = jsonout[key];
                    }
                    if(this.opts.instantOut && this.stdout != false) this.stdout.write(stdout);
                    resolve(stdout);
                  });
                }
              });
            });
          }
        })
        let stdout = await execute.catch((err) => reject(err));
        out += stdout;
        spin.succeed()
      }
      if(!this.opts.noinfo) {
        console.log();
        console.log(boxen(`${c} Finished building mix file..`, {padding: 1}));
        console.log();
      }
      resolve(out);
      if(!this.opts.instantOut && this.stdout != false) this.stdout.write(out)
    });
    return p;
  }

  run() {
    let p = new Promise(async (resolve, reject) => {
      let stdin;
      if(this.stdin == false) reject(new Error("Stdin is required when running in interactive mode"));
      if(this.stdin == true) stdin = process.stdin;
      else stdin = this.stdin;
    });
    return p;
  }

  /**
   * Validate languages used in the mix file
   * @param {String} code - The ocde to be validated
   * @returns {Promise} - Rejects if unsupported languages are used
   */
  validateLanguages(code) {
    let err = 0;
    let errText = "";
    let spin = ora('Validating languages... 0 erors found').start();
    let p = new Promise(async (resolve, reject) => {
      for(const line of code.split(/\n|\r|\r\n/g)) {
        if(/^\[\w*\]/g.test(line)) {
          let lng = line.replace(/\[|\]/g, '');
          if(!Object.values(languages).map(val => val.toUpperCase()).includes(lng)) {
            err++;
            errText += `\n${e} ${lng} is not a supported language`;
            spin.text = `Validating languages... ${err} errors found`
            reject();
          }
          DEBUG('OK')
        }
      }
      if(!err) spin.succeed('Validated languages with no errors.')
      else spin.fail(`Validated languages with ${err} errors: ${errText}`)
      resolve();
    });
    return p;
  }

  /**
   * Separates the mix file into code segments
   * @param {String} code - The code to be separated into segments
   * @returns {Promise<Array<Object<String, String>>>} - An array of objects containing the language and the code segment
   */
  segmentSeparation(code) {
    let warn = "";
    let err = 0;
    let errText = "";
    let spin = ora('Separating code segments...').start();
    let p = new Promise(async (resolve, reject) => {
      let out = [];
      let currentLang = "";
      let inSegment = "";
      for(const line of code.split(/\n|\r|\r\n/g)) {
        if(/^\[\w*\]/g.test(line)) {
          if(inSegment != "") {
            out.push({lang: currentLang, code: inSegment});
            DEBUG('Added segment')
            inSegment = "";
          }
          currentLang = line.replace(/\[|\]/g, '').toLowerCase();
        }else {
          if(currentLang == "") { err++; errText = "\n"+e+"Mix file contains code outside of a language segment"; reject(); }
          if(inSegment != "") inSegment += "\n";
          inSegment += line;
        }
      }
      if(inSegment != "") out.push({lang: currentLang, code: inSegment});
      if(inSegment == "" && currentLang != "") warn += `\n${w} Trailing language segment: ${currentLang}`;
      if(err) spin.fail(`Separated code segments with ${err} errors: ${errText}`)
      else if(warn != "") spin.succeed("Code segments separated with warnings: "+warn);
      else spin.succeed('Separated code segments with no errors.')
      resolve(out);
    });
    return p;
  }
}

class Parser {
  static parseLine(line, lang) {
    let p = new Promise(async (resolve, reject) => {
      let out = {
        variablesDefined: []
      };
      if(lang.toLowerCase() == "js") {
        if(/(let|var|const)\s\w*\s*=\s*[^;\n]*;?/g.test(line)) {
          line.match(/(let|var|const)\s\w*\s*=\s*[^;\n]*;?/g).forEach(match => {
            let re = match.replace(/(let|var|const)\s*|\s*=\s*|;/g, '')
            out.variablesDefined.push({identifier: re[0], value: re.slice(1-re.length)});
          });
        }
      }else if(lang.toLowerCase() == "py") {
        if(/(\w*)\s*=\s*[^;\n]*;?/g.test(line)) {
          line.match(/(\w*)\s*=\s*[^;\n]*;?/g).forEach(match => {
            let re = match.replace(/\s*=\s*|;/g, '')
            out.variablesDefined.push({identifier: re[0], value: re.slice(1-re.length)});
          });
        }
      }
      resolve(out);
    });
    return p;
  }

  static parseCodeSegment(code, lang, globals, numO=1, numM=1) {
    let p = new Promise(async (resolve, reject) => {
      let spin = ora(`Parsing code segment (${numO}/${numM})...`).start();
      let err = 0;
      let errText = "";
      for(const line of code.split(/\n|\r|\r\n/g)) {
        let out = await Parser.parseLine(line, lang).catch(err => {reject(err)});
        for(const id of out.variablesDefined) {
          if(Object.keys(globals).includes(id.identifier)) {
            if(lang == 'js') {
              err++;
              errText = `\n${e} Variable ${id.identifier} is already defined`;
            }
          }else {
            globals[id.identifier] = id.value;
          }
        }
      }
      if(err) {spin.fail(`Parsed code segment (${numO}/${numM}) with ${err} errors: ${errText}`); reject();}
      else spin.succeed(`Parsed code segment (${numO}/${numM}) with no errors.`)
      resolve();
    });
    return p;
  }
}

class Compiler {
  static async prepCodeSegment(code, lang, globals, numO=1, numM=1) {
    let p = new Promise(async (resolve, reject) => {
      let spin = ora(`Preparing code segment (${numO}/${numM})...`).start();
      let err = 0;
      let errText = "";
      let out = "";
      let varsDefined = [];
      for(const line of code.split(/\r\n|\n/g)) {
        let o = await Parser.parseLine(line, lang).catch(err => {reject(err)});
        if(o.variablesDefined.length > 0) varsDefined.push(o.variablesDefined.map((val) => val.identifier));
      }
      if(lang == "py") out += "import json\nimport os\n";
      varsDefined = varsDefined.map(val => String(val))
      for(const vrs of Object.keys(globals)) {
        if(lang == "js" && !varsDefined.includes(vrs)) {
          out += `var ${vrs} = ${globals[vrs]};\n`;
        } else if(lang == "py") {
          out += `${vrs} = ${globals[vrs]}\n`;
        }
      }
      out += code;
      if(lang == "js") {
        out += `\n;(() => {
const fs = require('fs');
const path = require('path');
let dout = {};
${Object.keys(globals).map(val => `dout['${val}'] = ${val};`).join('\n')}
fs.writeFileSync(path.join(__dirname, 'out.json'), JSON.stringify(dout));
})()`;
      }else if(lang == "py") {
        out += `\ndout = {}
${Object.keys(globals).map(val => `dout['${val}'] = ${val}`).join('\n')}
with open(os.path.dirname(os.path.abspath(__file__))+'/out.json', 'w') as f:
\tjson.dump(dout, f)
\tf.close()`;
      }
      if(err) spin.fail(`Prepared code segment (${numO}/${numM}) with ${err} errors: ${errText}`)
      else spin.succeed(`Prepared code segment (${numO}/${numM}) with no errors.`)
      resolve(out);
    });
    return p;
  }
}

module.exports.MixProgram = MixProgram;
module.exports.Mix = Mix;