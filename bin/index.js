#!/usr/bin/env node

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const chalk = require('chalk');
//const inquirer = require('inquirer');
const fs = require('fs');
const path = require('path');

const mix = require('../src/index');

const argv = yargs(hideBin(process.argv))
  .scriptName('mix')
  .usage('Usage: $0 <command> [options]')
  .command('init', 'Initialize a new mix project')
  .command('run', 'Run a mix project or file')
  .command('build', 'Build a mix project or file')
  .example('$0 init -y', 'Initialize a new mix project with default settings')
  .example('$0 run .', 'Run the main file in the current directory')
  .example('$0 run test.mixl', 'Run the main.mixl file in the current directory')
  .example('$0 build .', 'Build the main file in the current directory')
  .epilog('Version: α 0.0.1')
  .boolean('yes')
  .boolean('prealpha')
  .boolean('debug')
  .alias('d', 'debug')
  .alias('y', 'yes')
  .alias('p', 'prealpha')
  .describe('y', 'Automatically answer yes to prompts')
  .describe('prealpha', 'Run using the pre-alpha version of mix')
  .argv

if(argv._[0] == 'init') {
  if(argv.yes) {
    console.log(chalk.green('Initializing a new default mix project...'));
    let jsondata = {
      name: process.cwd().split(path.sep).pop(),
      version: "1.0.0",
      description: "A new mix project",
      main: "main.mixl",
      dependencies: {},
      languages: ["js", "py"]
    }
    fs.writeFileSync(path.join(process.cwd(), "mixconf.json"), JSON.stringify(jsondata, null, 2));
  }else {

  }
}else if(argv._[0] == 'run') {
  if(argv.prealpha) {
    if(argv._[1]) {
      if(!fs.existsSync(argv._[1])) {
        console.log(chalk.red('File not found: ' + argv._[1]));
        process.exit(1);
      }
      let mp = new mix.Mix(path.join(process.cwd(), argv._[1]), {autoBuild: true, autoRun: true, debug: argv.debug});
    } else {
      console.log(chalk.red('No file specified'));
    }
  } else {

  }
}