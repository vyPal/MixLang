#!/usr/bin/env node

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const chalk = require('chalk');
const inquirer = require('inquirer');
const fs = require('fs');
const path = require('path');

const { Mix } = require('../src/index');
const { fileURLToPath } = require('url');

const argv = yargs(hideBin(process.argv))
  .scriptName('mxl')
  .usage('Usage: $0 <command> [options]')
  .command('init', 'Initialize a new mix project')
  .command('run', 'Build and run a mix file in interactive mode (with stdin)')
  .command('build', 'Build and run a mix file in non-interactive mode (no stdin)')
  .example('$0 init -y', 'Initialize a new mix project with default settings')
  .example('$0 run .', 'Run the main file in interactive mode')
  .example('$0 build .', 'Build the main file and run in a non-interactive mode')
  .epilog('Version: 0.0.1')
  .boolean('yes')
  .boolean('debug')
  .boolean('out')
  .boolean('noinfo')
  .boolean('bench')
  .alias('n', 'noinfo')
  .alias('o', 'out')
  .alias('d', 'debug')
  .alias('y', 'yes')
  .alias('b', 'bench')
  .describe('yes', 'Automatically answer yes to prompts')
  .describe('out', 'Print the output to console during execution')
  .describe('noinfo', 'Do not print info messages, only stdout and stderr')
  .describe('bench', 'Measures time taken by separate tasks')
  .describe('debug', 'Prints debug messages')
  .demandCommand()
  .argv

if(argv._[0] == 'init') {
  if(argv.yes) {
    let initPath = argv._.length > 1 ? argv._[1] : '';
    console.log(chalk.green('Initializing a new default mix project...'));
    if(!fs.existsSync(path.join(process.cwd(), initPath))) fs.mkdirSync(path.join(process.cwd(), initPath));
    let jsondata = {
      name: process.cwd().split(path.sep).pop(),
      version: "1.0.0",
      description: "A new mix project",
      main: "main.mxl",
      dependencies: {},
      languages: ["js", "py"]
    }
    fs.writeFileSync(path.join(process.cwd(), initPath, "mixconf.json"), JSON.stringify(jsondata, null, 2));
  }else {
    let dName = argv._.length > 1 ? argv._[1] : process.cwd().split(path.sep).pop();
    inquirer.prompt([
      {
        type: "input",
        name: "name",
        message: "What is the name of your project?",
        default: dName
      },
      {
        type: "input",
        name: "version",
        message: "What is the version of your project?",
        default: "1.0.0"
      },
      {
        type: "input",
        name: "description",
        message: "What is the description of your project?",
        default: "A new mix project"
      },
      {
        type: "input",
        name: "main",
        message: "What is the name of your main file?",
        default: "main.mxl"
      }
    ]).then(settings => {
      let initPath = argv._.length > 1 ? argv._[1] : '';
      if(!fs.existsSync(path.join(process.cwd(), initPath))) fs.mkdirSync(path.join(process.cwd(), initPath));
      console.log(chalk.green('Initializing a new default mix project...'));
      let jsondata = {
        name: settings.name,
        version: settings.version,
        description: settings.description,
        main: settings.main,
        dependencies: {},
        languages: ["js", "py"]
      }
      fs.writeFileSync(path.join(process.cwd(), initPath, "mixconf.json"), JSON.stringify(jsondata, null, 2));
    });
  }
}else if(argv._[0] == 'build') {
  if(argv._[1]) {
    if(!fs.existsSync(argv._[1])) {
      console.log(chalk.red('File not found: ' + argv._[1]));
      process.exit(1);
    }
    if(fs.statSync(argv._[1]).isDirectory()) {
      if(fs.existsSync(path.join(argv._[1], "mixconf.json"))) {
        let mixconf = JSON.parse(fs.readFileSync(path.join(argv._[1], "mixconf.json")));
        if(!mixconf.main) {
          console.log(chalk.red('No main file specified in mixconf.json'));
          process.exit(1);
        }
        let mp = new Mix(path.join(process.cwd(), argv._[1], mixconf.main), {build: true, debug: argv.debug||false, instantOut: argv.out, noinfo: argv.noinfo||false});
      }
    }else {
      let mp = new Mix(path.join(process.cwd(), argv._[1]), {build: true, debug: argv.debug||false, instantOut: argv.out, noinfo: argv.noinfo||false});
    }
  }else {
    console.log(chalk.red('No file specified'));
  }
}else if(argv._[0] == 'run') {
  if(argv._[1]) {
    if(!fs.existsSync(argv._[1])) {
      console.log(chalk.red('File not found: ' + argv._[1]));
      process.exit(1);
    }
    if(fs.statSync(argv._[1]).isDirectory()) {
      if(fs.existsSync(path.join(argv._[1], "mixconf.json"))) {
        let mixconf = JSON.parse(fs.readFileSync(path.join(argv._[1], "mixconf.json")));
        if(!mixconf.main) {
          console.log(chalk.red('No main file specified in mixconf.json'));
          process.exit(1);
        }
        let mp = new Mix(path.join(process.cwd(), argv._[1], mixconf.main), {run: true, debug: argv.debug||false, stdin: true, instantOut: true, noinfo: argv.noinfo||false});
      }
    }else {
      let mp = new Mix(path.join(process.cwd(), argv._[1]), {run: true, debug: argv.debug||false, stdin: true, instantOut: true, noinfo: argv.noinfo||false});
    }
  }else {
    console.log(chalk.red('No file specified'));
  }
}