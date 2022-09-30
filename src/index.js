let fs = require('fs');
let path = require('path');
const { exec, spawn } = require('child_process');
const chalk = require('chalk');
const boxen = require('boxen');
const process = require('process');
const { performance } = require('perf_hooks');
const md5 = require('md5');
const ms = require('ms');
const cliProgress = require('cli-progress');

let languages = {
  javascript: "js",
  python: "py"
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
   * @property {boolean} [bench=false] - If true the time taken to run the code will be printed
   * @property {boolean} [execorder=false] - If true the execution order will be printed
   * @property {boolean} [progress=false] - If a progress bar should be shown
   */
  /**
   * @constructor
   * @param {String} filePath - Full path to the file to be mixed
   * @param {MixOptions} opts - Options for mixing the file
   */
  constructor(filePath, opts = {}) {
    this.filePath = filePath;
    this.opts = Object.assign({}, {build: false, run: false, debug: false, stdin: false, stdout: true, instantOut: false, noinfo: false, bench: false, execorder: false, progress: false}, opts);
    this.stdin = this.opts.stdin;
    this.stdout = this.opts.stdout;
    this.binfo = {};
    this.execorder = [];
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
    this.functions = {};
    if(this.opts.debug) DEBUG = (...args) => {console.log(d+" "+args)};
    if(this.opts.build) {
      let bStart = performance.now()
      this.build().catch((err) => {console.log(`\n${e} Build failed: \n${err}`);process.exit(1)}).then(() => {
        let bEnd = performance.now()
        let buildTime = bEnd - bStart;
        let bText = `${c} Benchmarks:`;
        for(const key of Object.keys(this.binfo)) {
          let val = String(this.binfo[key]).split('.');
          bText += `\n     ${key}: ${val[0]+"."+val[1].slice(0, 4)}ms  `;
        }
        let val = String(buildTime).split('.');
        bText += `\n\n   Build time: ${parseInt(val[0])/1000+val[1].slice(0, 4)}s  `;
        if(this.opts.bench) {
          console.log();
          console.log(boxen(bText, {padding: 1}));
          console.log();
        }
        if(this.opts.execorder) {
          console.log();
          console.log(boxen(`${c} Execution order:\n\n${this.execorder.join("\n")}`, {padding: 1}));
          console.log();
        }
      })
    }else if(this.opts.run) {
      return this.run().catch((err) => {process.exit(1)})
    }
  }

  /**
   * Builds the mix file
   * @returns {Promise<String>} - Information about how the building went
   */
  build() {
    let p = new Promise(async (resolve, reject) => {
      if(this.stdin != false) W("Stdin is not needed when building");
      let pStart = performance.now();
      let code = await fs.promises.readFile(this.filePath, "utf8");
      let pEnd = performance.now();
      this.binfo['file_read'] = pEnd-pStart;
      pStart = performance.now();
      await this.validateLanguages(code).catch((err) => reject(err));
      pEnd = performance.now();
      this.binfo['validation'] = pEnd-pStart;
      pStart = performance.now();
      let seg = await this.segmentSeparation(code).catch((err) => reject(err));
      const bar1 = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
      let bar1done = 0;
      if(this.opts.progress) bar1.start(seg.length, 0);
      pEnd = performance.now();
      this.binfo['separation'] = pEnd-pStart;
      let numSegmentsParsed = 0;
      pStart = performance.now();
      for(const segment of seg) {
        numSegmentsParsed += 1;
        await Parser.parseCodeSegment(segment.code, segment.lang, this.globals, this.functions, numSegmentsParsed, seg.length).catch((err) => reject(err));
      }
      pEnd = performance.now();
      this.binfo["segment_parse"] = pEnd-pStart;
      let out = "";
      let numSegmentsRun = 0;
      let pyRunning = 0;
      let jsRunning = 0;
      for(const toRun of seg) {
        let pStart = performance.now();
        while(pyRunning>0||jsRunning>0) { 
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        if(toRun.lang == "py") pyRunning++;
        if(toRun.lang == "js") jsRunning++;
        numSegmentsRun += 1;
        let spin = ora(`Running segment ${numSegmentsRun}/${seg.length}`).start();
        let execute = new Promise(async (resolve, reject) =>{
          let code = await Compiler.prepCodeSegment(toRun.code, toRun.lang, this.globals, this.functions, numSegmentsRun, seg.length).catch((err) => reject(err));
          if(typeof code == "string") {
            if(toRun.lang == "js") {
              if(!fs.existsSync(path.join(process.cwd(), "temp"))) {
                await fs.promises.mkdir(path.join(process.cwd(), "temp"));
              }
              let m = md5(code);
              this.execorder.push(m);
              fs.writeFile(path.join(process.cwd(), "temp", `${m}.mxl.js`), code, (error) => {
                if(error) reject(error);
                exec(`node ${path.join(process.cwd(), "temp", `${m}.mxl.js`)}`, (err, stdout, stderr) => {
                  if(err) {
                    reject(err);
                  }else {
                    fs.readFile(path.join(process.cwd(), "temp", m+".json"), (err, data) => {
                      if(err) reject(err);
                      let jsonout = JSON.parse(data);
                      for(const key of Object.keys(jsonout)) {
                        if(typeof jsonout[key] == "string") this.globals[key] = "\""+jsonout[key]+"\"";
                        else this.globals[key] = jsonout[key];
                      }
                      if(this.opts.instantOut && this.stdout != false) this.stdout.write(stdout);
                      out += stdout;
                      if(toRun.lang == "py") pyRunning--;
                      if(toRun.lang == "js") jsRunning--;
                      resolve()
                    });
                  }
                });
              });
            } else if(toRun.lang == "py") {
              if(!fs.existsSync(path.join(process.cwd(), "temp"))) {
                fs.mkdirSync(path.join(process.cwd(), "temp"));
              }
              let m = md5(code);
              this.execorder.push(m);
              fs.writeFile(path.join(process.cwd(), "temp", `${m}.mxl.py`), code, (error) => {
                if(error) reject(error);
                exec(`python ${path.join(process.cwd(), "temp", `${m}.mxl.py`)}`, (err, stdout, stderr) => {
                  if(err) {
                    reject(err);
                  }else {
                    fs.readFile(path.join(process.cwd(), "temp", m+".json"), (err, data) => {
                      if(err) reject(err);
                      let jsonout = JSON.parse(data);
                      for(const key of Object.keys(jsonout)) {
                        if(typeof jsonout[key] == "string") this.globals[key] = "\""+jsonout[key]+"\"";
                        else this.globals[key] = jsonout[key];
                      }
                      if(this.opts.instantOut && this.stdout != false) this.stdout.write(stdout);
                      out += stdout;
                      if(toRun.lang == "py") pyRunning--;
                      if(toRun.lang == "js") jsRunning--;
                      resolve()
                    });
                  }
                });
              });
            }
          }else if(Array.isArray(code)) {
            let waitingFor = code.length;
            let done = 0;
            let working = false;
            for(const cs of code) {
              while (working) {
                await new Promise((resolve) => setTimeout(resolve, 10));
              }
              working = true;
              if(cs.ficr == '') {
                if(cs.lang == "js") {
                  if(!fs.existsSync(path.join(process.cwd(), "temp"))) {
                    fs.mkdirSync(path.join(process.cwd(), "temp"));
                  }
                  cs.code.match(/##!!MIXER_REPLACE_[^!]!!##/g).forEach(r => {
                    let value = this.globals[r.replace(/##!!MIXER_REPLACE_|!!##/g, '')];
                    cs.code = cs.code.replace(r, value);
                  })
                  let m = md5(cs.code);
                  this.execorder.push(m);
                  fs.writeFile(path.join(process.cwd(), "temp", `${m}.mxl.js`), cs.code, (error) => {
                    if(error) reject(error);
                    exec(`node ${path.join(process.cwd(), "temp", `${m}.mxl.js`)}`, (err, stdout, stderr) => {
                      if(err) {
                        reject(err);
                      }else {
                        fs.readFile(path.join(process.cwd(), "temp", m+".json"), (err, data) => {
                          if(err) reject(err);
                          let jsonout = JSON.parse(data);
                          for(const key of Object.keys(jsonout)) {
                            if(typeof jsonout[key] == "string") this.globals[key] = "\""+jsonout[key]+"\"";
                            else this.globals[key] = jsonout[key];
                          }
                          if(this.opts.instantOut && this.stdout != false) this.stdout.write(stdout);
                          out += stdout;
                          done++;
                          working = false;
                        });
                      }
                    });
                  });
                } else if(cs.lang == "py") {
                  if(!fs.existsSync(path.join(process.cwd(), "temp"))) {
                    fs.mkdirSync(path.join(process.cwd(), "temp"));
                  }
                  cs.code.match(/##!!MIXER_REPLACE_[^!]!!##/g).forEach(r => {
                    let value = this.globals[r.replace(/##!!MIXER_REPLACE_|!!##/g, '')];
                    cs.code = cs.code.replace(r, value);
                  })
                  let m = md5(cs.code);
                  this.execorder.push(m);
                  fs.writeFile(path.join(process.cwd(), "temp", `${m}.mxl.py`), cs.code, (error) => {
                    if(error) reject(error);
                    exec(`python ${path.join(process.cwd(), "temp", `${m}.mxl.py`)}`, (err, stdout, stderr) => {
                      if(err) {
                        reject(err);
                      }else {
                        fs.readFile(path.join(process.cwd(), "temp", m+".json"), (err, data) => {
                          if(err) reject(err);
                          let jsonout = JSON.parse(data);
                          for(const key of Object.keys(jsonout)) {
                            if(typeof jsonout[key] == "string") this.globals[key] = "\""+jsonout[key]+"\"";
                            else this.globals[key] = jsonout[key];
                          }
                          if(this.opts.instantOut && this.stdout != false) this.stdout.write(stdout);
                          out += stdout;
                          done++;
                          working = false;
                        });
                      }
                    });
                  });
                }
              }else {
                if(cs.lang == "js") {
                  if(!fs.existsSync(path.join(process.cwd(), "temp"))) {
                    fs.mkdirSync(path.join(process.cwd(), "temp"));
                  }
                  cs.code.match(/##!!MIXER_REPLACE_[^!]!!##/g).forEach(r => {
                    let value = this.globals[r.replace(/##!!MIXER_REPLACE_|!!##/g, '')];
                    cs.code = cs.code.replace(r, value);
                  })
                  let m = md5(cs.code);
                  this.execorder.push(m);
                  fs.writeFile(path.join(process.cwd(), "temp", `${m}.mxl.js`), cs.code, (error) => {
                    if(error) reject(error);
                    exec(`node ${path.join(process.cwd(), "temp", `${m}.mxl.js`)}`, (err, stdout, stderr) => {
                      if(err) {
                        reject(err);
                      }else {
                        if(this.opts.instantOut && this.stdout != false) this.stdout.write(stdout);
                        if(out[out.length-1] == '\n') out += stdout;
                        else out += '\n'+stdout;
                        fs.readFile(path.join(process.cwd(), "temp", m+".json"), (err, data) => {
                          if(err) reject(err);
                          let jsonout = JSON.parse(data);
                          for(const key of Object.keys(jsonout)) {
                            // -----------------------------------------------------------------------------------------------------------------------
                            // -----------------------------------------------------------------------------------------------------------------------
                            if(key == '__fReturn') {
                              let fReturn = jsonout[key];
                              let o = "";
                              if(cs.ficrlang == "py") o += "import json\nimport os\n";
                              for(const vrs of Object.keys(this.globals)) {
                                if(cs.ficrlang == "js") {
                                  o += `var ${vrs} = ${this.globals[vrs]};\n`;
                                } else if(cs.ficrlang == "py") {
                                  o += `${vrs} = ${this.globals[vrs]}\n`;
                                }
                              }
                              o += cs.ficr.replace('##!!MIXER_FUNC_CALL!!##', fReturn);
                              if(cs.ficrlang == "js") {
                                o += `\n;(() => {
const fs = require('fs');
const path = require('path');
let dout = {};
${Object.keys(this.globals).map(val => `dout['${val}'] = ${val};`).join('\n')}
fs.writeFileSync(path.join(__dirname, __filename.slice(__dirname.length + 1, -7)+'.json'), JSON.stringify(dout));
})()`;
                              }else if(cs.ficrlang == "py") {
                                o += `\ndout = {}
${Object.keys(this.globals).map(val => `dout['${val}'] = ${val}`).join('\n')}
with open(os.path.dirname(os.path.abspath(__file__))+'/'+os.path.basename(__file__)[0:-7]+'.json', 'w') as f:
\tjson.dump(dout, f)
\tf.close()`;
                              }
                              let m1 = md5(o);
                              this.execorder.push(m1);
                              fs.writeFile(path.join(process.cwd(), "temp", m1+".mxf."+cs.ficrlang), o, (error) => {
                                if(error) reject(error);
                                exec(`${cs.ficrlang == "js" ? "node": "python"} ${path.join(process.cwd(), "temp", m1+".mxf."+cs.ficrlang)}`, (err, so, stderr) => {
                                  if(err) {
                                    reject(err);
                                  }else {
                                    fs.readFile(path.join(process.cwd(), "temp", m1+".json"), (err, data) => {
                                      if(err) reject(err);
                                      let jsonout = JSON.parse(data);
                                      for(const key of Object.keys(jsonout)) {
                                        if(typeof jsonout[key] == "string") this.globals[key] = "\""+jsonout[key]+"\"";
                                        else this.globals[key] = jsonout[key];
                                      }
                                      if(this.opts.instantOut && this.stdout != false) this.stdout.write(so);
                                      if(out[out.length-1] == '\n') out += so;
                                      else out += '\n'+so;
                                      done++;
                                      working = false;
                                    });
                                  }
                                });
                              })
                            }
                            // -----------------------------------------------------------------------------------------------------------------------
                            // -----------------------------------------------------------------------------------------------------------------------
                            else if(typeof jsonout[key] == "string") this.globals[key] = "\""+jsonout[key]+"\"";
                            else this.globals[key] = jsonout[key];
                          }
                        });
                      }
                    });
                  });
                } else if(cs.lang == "py") {
                  if(!fs.existsSync(path.join(process.cwd(), "temp"))) {
                    fs.mkdirSync(path.join(process.cwd(), "temp"));
                  }
                  cs.code.match(/##!!MIXER_REPLACE_[^!]!!##/g).forEach(r => {
                    let value = this.globals[r.replace(/##!!MIXER_REPLACE_|!!##/g, '')];
                    cs.code = cs.code.replace(r, value);
                  })
                  let m = md5(cs.code);
                  this.execorder.push(m);
                  fs.writeFile(path.join(process.cwd(), "temp", `${m}.mxl.py`), cs.code, (error) => {
                    if(error) reject(error);
                    exec(`python ${path.join(process.cwd(), "temp", `${m}.mxl.py`)}`, (err, stdout, stderr) => {
                      if(err) {
                        reject(err);
                      }else {
                        if(this.opts.instantOut && this.stdout != false) this.stdout.write(stdout);
                        if(out[out.length-1] == '\n') out += stdout;
                        else out += '\n'+stdout;
                        fs.readFile(path.join(process.cwd(), "temp", m+".json"), (err, data) => {
                          if(err) reject(err);
                          let jsonout = JSON.parse(data);
                          for(const key of Object.keys(jsonout)) {
                            // -----------------------------------------------------------------------------------------------------------------------
                            // -----------------------------------------------------------------------------------------------------------------------
                            if(key == '__fReturn') {
                              let fReturn = jsonout[key];
                              let o = "";
                              if(cs.ficrlang == "py") o += "import json\nimport os\n";
                              for(const vrs of Object.keys(this.globals)) {
                                if(cs.ficrlang == "js") {
                                  o += `var ${vrs} = ${this.globals[vrs]};\n`;
                                } else if(cs.ficrlang == "py") {
                                  o += `${vrs} = ${this.globals[vrs]}\n`;
                                }
                              }
                              o += cs.ficr.replace('##!!MIXER_FUNC_CALL!!##', fReturn);
                              if(cs.ficrlang == "js") {
                                o += `\n;(() => {
const fs = require('fs');
const path = require('path');
let dout = {};
${Object.keys(this.globals).map(val => `dout['${val}'] = ${val};`).join('\n')}
fs.writeFileSync(path.join(__dirname, __filename.slice(__dirname.length + 1, -7)+'.json'), JSON.stringify(dout));
})()`;
                              }else if(cs.ficrlang == "py") {
                                o += `\ndout = {}
${Object.keys(this.globals).map(val => `dout['${val}'] = ${val}`).join('\n')}
with open(os.path.dirname(os.path.abspath(__file__))+'/'+os.path.basename(__file__)[0:-7]+'.json', 'w') as f:
\tjson.dump(dout, f)
\tf.close()`;
                              }
                              let m1 = md5(o);
                              this.execorder.push(m1);
                              fs.writeFile(path.join(process.cwd(), "temp", m1+".mxf."+cs.ficrlang), o, (error) => {
                                if(error) reject(error);
                                exec(`${cs.ficrlang == "js" ? "node": "python"} ${path.join(process.cwd(), "temp", m1+".mxf."+cs.ficrlang)}`, (err, so, stderr) => {
                                  if(err) {
                                    reject(err);
                                  }else {
                                    fs.readFile(path.join(process.cwd(), "temp", m1+".json"), (err, data) => {
                                      if(err) reject(err);
                                      let jsonout = JSON.parse(data);
                                      for(const key of Object.keys(jsonout)) {
                                        if(typeof jsonout[key] == "string") this.globals[key] = "\""+jsonout[key]+"\"";
                                        else this.globals[key] = jsonout[key];
                                      }
                                      if(this.opts.instantOut && this.stdout != false) this.stdout.write(so);
                                      if(out[out.length-1] == '\n') out += so;
                                      else out += '\n'+so;
                                      done++;
                                      working = false;
                                    });
                                  }
                                });
                              })
                            }
                            // -----------------------------------------------------------------------------------------------------------------------
                            // -----------------------------------------------------------------------------------------------------------------------
                            if(typeof jsonout[key] == "string") this.globals[key] = "\""+jsonout[key]+"\"";
                            else this.globals[key] = jsonout[key];
                          }
                        });
                      }
                    });
                  });
                }
              }
            }
            while(done < waitingFor) {
              await new Promise((resolve) => setTimeout(resolve, 10));
            }
            if(toRun.lang == "py") pyRunning--;
            if(toRun.lang == "js") jsRunning--;
            resolve()
          }
        })
        await execute.catch((err) => reject(err));
        spin.succeed()
        let pEnd = performance.now();
        this.binfo[`block_${numSegmentsRun}_run`] = pEnd - pStart;
        bar1done++;
        if(this.opts.progress) bar1.update(bar1done);
      }
      if(!this.opts.noinfo) {
        console.log();
        console.log(boxen(`${c} Finished building mix file..`, {padding: 1}));
        console.log();
      }
      resolve(out);
      bar1.stop();
      if(!this.opts.instantOut && this.stdout != false) this.stdout.write(out)
    });
    return p;
  }

  run() {
    let p = new Promise(async (resolve, reject) => {
      let code = await fs.promises.readFile(this.filePath, "utf8");
      resolve();
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
            let ident = match.replace(/(let|const|var)\s*|\s*=\s*[^\n;];?/g, '');
            let re = match.replace(/(let|var|const)\s*[^=]\s*=\s*|;/g, '')
            out.variablesDefined.push({identifier: ident, value: re});
          });
        }
      }else if(lang.toLowerCase() == "py") {
        if(/(\w*)\s*=\s*[^;\n]*;?/g.test(line)) {
          line.match(/(\w*)\s*=\s*[^;\n]*;?/g).forEach(match => {
            let ident = match.replace(/\s*=\s*[^\n;];?/g, '')
            let re = match.replace(/[^=]\s*=\s*|;/g, '')
            out.variablesDefined.push({identifier: ident, value: re});
          });
        }
      }
      resolve(out);
    });
    return p;
  }

  static parseCodeSegment(code, lang, globals, functions, numO=1, numM=1) {
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
      let func = await Parser.isolateFunctions(code, lang);
      if(func.length) {
        for(const fn of func) {
          if(Object.keys(functions).includes(fn.name)) {
            err++;
            errText = `\n${e} Function ${fn.name} is already defined`;
          }else {
            functions[fn.name] = {name: fn.name, code: fn.code, variables: fn.variables, lang: lang};
          }
        }
      }
      if(err) {spin.fail(`Parsed code segment (${numO}/${numM}) with ${err} errors: ${errText}`); reject(errText);}
      else spin.succeed(`Parsed code segment (${numO}/${numM}) with no errors.`)
      resolve();
    });
    return p;
  }

  static isolateFunctions(code, lang) {
    let p = new Promise(async (resolve, reject) => {
      let spin = ora('Isolating functions...').start();
      let err = 0;
      let errText = "";
      let out = [];
      let inFunction = false;
      let inFunctionName = "";
      let inFunctionVariables = [];
      let inFunctionCode = "";
      let awaitingBrackets = 0;
      let onIndent = 0;
      for(const line of code.split(/\n|\r|\r\n/g)) {
        if(inFunction) {
          if(lang == "js") {
            if(line.includes("}") && awaitingBrackets == 0) {
              inFunction = false;
              out.push({name: inFunctionName, code: inFunctionCode+line, variables: inFunctionVariables});
              inFunctionName = "";
              inFunctionCode = "";
              inFunctionVariables = [];
            }else if(line.includes("}")) {
              awaitingBrackets--;
              inFunctionCode += line;
            }else {
              let brackets = line.replaceAll(/[^{]/g, '')
              awaitingBrackets += brackets.length;
              inFunctionCode += "\n"+line;
            }
          }else if(lang == "py") {
            if(line.match(/^\s*/g)[0].length < onIndent) {
              inFunction = false;
              out.push({name: inFunctionName, code: inFunctionCode+line, variables: inFunctionVariables});
              inFunctionName = "";
              inFunctionCode = "";
              inFunctionVariables = [];
            }else {
              inFunctionCode += "\n"+line;
            }
          }
        }else {
          if(line.includes("function") && lang == "js") {
            inFunction = true;
            inFunctionName = line.match(/function\s*(\w*)/g)[0].replace(/function\s*/g, '');
            for(const v of line.match(/\([^\)]*\)/g)[0].replace(/\(|\)/g, '').split(',')) {
              if(v != "") inFunctionVariables.push(v);
            }
            inFunctionCode = line;
          }else if(line.includes("def") && lang == "py") {
            inFunction = true;
            inFunctionName = line.match(/def\s*(\w*)/g)[0].replace(/def\s*/g, '');
            for(const v of line.match(/\([^\)]*\)/g)[0].replace(/\(|\)/g, '').split(',')) {
              if(v != "") inFunctionVariables.push(v);
            }
            inFunctionCode = line;
            onIndent = line.match(/^\s*/g)[0].length;
          }
        }
      }
      if(inFunction && lang == "js") {
        err++;
        errText = `\n${e} Unclosed function ${inFunctionName}`;
      }else if(inFunction && lang == "py") {
        inFunction = false;
        out.push({name: inFunctionName, code: inFunctionCode, variables: inFunctionVariables});
      }
      if(err) {spin.fail(`Isolated functions with ${err} errors: ${errText}`); reject(errText);}
      else spin.succeed('Isolated functions with no errors.')
      resolve(out);
    });
    return p;
  }

  static findCustomFunctionCalls(code, functions, lang) {
    let p = new Promise(async (resolve, reject) => {
      let spin = ora('Finding custom function calls...').start();
      let err = 0;
      let errText = "";
      let out = [];
      let cs = code.split(/\n|\r\n/g);
      for(let i=0; i<cs.length; i++) {
        let line = cs[i];
        if(line.includes("(") && line.includes(")")) {
          if(lang == "js") {
            if(line.match(/(?<!function )(\w+\()/g)) {
              line.match(/(?<!function )(\w+\()/g).forEach(fn => {
                let func = fn.replace(/\(/g, '');
                if(Object.keys(functions).includes(func)) {
                  let args = line.match(/\([^\)]*\)/g)[0].replace(/\(|\)/g, '').split(',');
                  if(args.length != functions[func].variables.length) {
                    err++;
                    errText = `\n${e} Function ${func} requires ${functions[func].variables.length} arguments, but ${args.length} were given`;
                  }else {
                    out.push({name: func, args: args, lineNo: i});
                  }
                }
              })
            }
          }else if(lang == "py") {
            if(line.match(/(?<!def )(\w+\()/g)) {
              line.match(/(?<!def )(\w+\()/g).forEach(fn => {
                let func = fn.replace(/\(/g, '');
                if(Object.keys(functions).includes(func)) {
                  let args = line.match(/\([^\)]*\)/g)[0].replace(/\(|\)/g, '').split(',');
                  if(args.length != functions[func].variables.length) {
                    err++;
                    errText = `\n${e} Function ${func} requires ${functions[func].variables.length} arguments, but ${args.length} were given`;
                  }else {
                    out.push({name: func, args: args, lineNo: i});
                  }
                }
              })
            }
          }
        }
      }
      if(err) {spin.fail(`Found custom function calls with ${err} errors: ${errText}`); reject();}
      else spin.succeed('Found custom function calls with no errors.')
      resolve(out);
    }).catch(err => {reject(err)});
    return p;
  }
}

class Compiler {
  static async prepCodeSegment(code, lang, globals, functions, numO=1, numM=1) {
    let p = new Promise(async (resolve, reject) => {
      let spin = ora(`Preparing code segment (${numO}/${numM})...`).start();
      let err = 0;
      let errText = "";
      let out = "";
      let varsDefined = [];
      let needsSplit = false;
      for(const line of code.split(/\r\n|\n/g)) {
        let o = await Parser.parseLine(line, lang).catch(err => {reject(err)});
        if(o.variablesDefined.length > 0) varsDefined.push(o.variablesDefined.map((val) => val.identifier));
      }
      let fCalls = await Parser.findCustomFunctionCalls(code, functions, lang).catch(err => {reject(err)});
      let codeSplit = [];
      let splitLines = [];
      for(const fCall of fCalls) {
        needsSplit = true;
        splitLines.push(fCall.lineNo);
      }
      if(needsSplit) {
        out = [];
        let split = code.split(/\r\n|\n/g);
        let segment = "";
        for(let i=0;i<split.length;i++) {
          if(splitLines.includes(i)) {
            codeSplit.push({code: segment, fCode: '', lang: lang, ifc: false});
            codeSplit.push({code: split[i], fCode: functions[fCalls[splitLines.indexOf(i)].name], lang: lang, ifc: true});
            segment = "";
          }else {
            segment += split[i]+"\n";
          }
        }
        codeSplit.push({code: segment, fCode: '', lang: lang, ifc: false});
        codeSplit.forEach(sp => {
          let {code: c, fCode: fc, lang: l, ifc} = sp;
          if(ifc) {
            let o = "";
            if(fc.lang == "py") o += "import json\nimport os\n";
            varsDefined = varsDefined.map(val => String(val))
            for(const vrs of Object.keys(globals)) {
              if(fc.lang == "js" && !varsDefined.includes(vrs)) {
                o += `var ${vrs} = ##!!MIXER_REPLACE_${vrs}!!##;\n`;
              } else if(fc.lang == "py") {
                o += `${vrs} = ##!!MIXER_REPLACE_${vrs}!!##\n`;
              }
            }
            let onlyFuncInCode = c.match(new RegExp(`${fc.name}\\([^)]*\\)`, 'g'))
            let funcInCodeRec = c.replace(new RegExp(`${fc.name}\\([^)]*\\)`, 'g'), '##!!MIXER_FUNC_CALL!!##');
            onlyFuncInCode.forEach(fn => {
              let args = fn.match(/\(([^)]*)/)[1].split(',');
              let func = fc.code;
              o+=fc.code+"\n";
              if(fc.lang == "js") {
                o += `var __fReturn = ${fc.name}(${args.join(', ')});\n`;
              }else if(fc.lang == "py") {
                o += `__fReturn = ${fc.name}(${args.join(', ')})\n`;
              }
              if(fc.lang == "js") {
                o += `\n;(() => {
const fs = require('fs');
const path = require('path');
let dout = {};
dout['__fReturn'] = __fReturn;
${Object.keys(globals).map(val => `dout['${val}'] = ${val};`).join('\n')}
fs.writeFileSync(path.join(__dirname, __filename.slice(__dirname.length + 1, -7)+'.json'), JSON.stringify(dout));
})()`;
              }else if(fc.lang == "py") {
                o += `\ndout = {}
dout['__fReturn'] = __fReturn
${Object.keys(globals).map(val => `dout['${val}'] = ${val}`).join('\n')}
with open(os.path.dirname(os.path.abspath(__file__))+'/'+os.path.basename(__file__)[0:-7]+'.json', 'w') as f:
\tjson.dump(dout, f)
\tf.close()`;
              }
            })
            out.push({code: o, ficr: funcInCodeRec, lang: fc.lang, ficrlang: l});
          } else {
            let o = "";
            if(l == "py") o += "import json\nimport os\n";
            varsDefined = varsDefined.map(val => String(val))
            for(const vrs of Object.keys(globals)) {
              if(l == "js" && !varsDefined.includes(vrs)) {
                o += `var ${vrs} = ##!!MIXER_REPLACE_${vrs}!!##;\n`;
              } else if(l == "py") {
                o += `${vrs} = ##!!MIXER_REPLACE_${vrs}!!##\n`;
              }
            }
            o += c;
            if(l == "js") {
              o += `\n;(() => {
const fs = require('fs');
const path = require('path');
let dout = {};
${Object.keys(globals).map(val => `dout['${val}'] = ${val};`).join('\n')}
fs.writeFileSync(path.join(__dirname, __filename.slice(__dirname.length + 1, -7)+'.json'), JSON.stringify(dout));
})()`;
            }else if(l == "py") {
              o += `\ndout = {}
${Object.keys(globals).map(val => `dout['${val}'] = ${val}`).join('\n')}
with open(os.path.dirname(os.path.abspath(__file__))+'/'+os.path.basename(__file__)[0:-7]+'.json', 'w') as f:
\tjson.dump(dout, f)
\tf.close()`;
            }
            out.push({code: o, ficr: '', lang: l, ficrlang: ''});
          }
        })
      }else {
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
fs.writeFileSync(path.join(__dirname, __filename.slice(__dirname.length + 1, -7)+'.json'), JSON.stringify(dout));
})()`;
        }else if(lang == "py") {
          out += `\ndout = {}
${Object.keys(globals).map(val => `dout['${val}'] = ${val}`).join('\n')}
with open(os.path.dirname(os.path.abspath(__file__))+'/'+os.path.basename(__file__)[0:-7]+'.json', 'w') as f:
\tjson.dump(dout, f)
\tf.close()`;
        }
      }
      if(err) spin.fail(`Prepared code segment (${numO}/${numM}) with ${err} errors: ${errText}`)
      else spin.succeed(`Prepared code segment (${numO}/${numM}) with no errors.`)
      resolve(out);
    });
    return p;
  }
}

module.exports.Mix = Mix;
module.exports.Parser = Parser;
module.exports.Compiler = Compiler;