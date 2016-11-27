#!/usr/bin/env babel-node
/* @flow */

import chokidar from 'chokidar'
import path from 'path'
import fs from 'fs'

function getPackageName(file: string): string {
  const dir = path.dirname(file)
  return dir.substring(/\b(org|com)\b/.exec(dir).index).replace(/[\/\\]/g, '.')
}

function generateRecordForFile(file: string) {
  try {
    delete require.cache[require.resolve(file)]
    const record = require(file)
    record.name = /(\w+)\.record\.js$/.exec(file)[1]
    record.pkg = getPackageName(file)
    record.sourceFile = path.basename(file)
    const generateRecord = require(path.join(__dirname, record.type || 'pojo')).default
    const javaFile = file.replace(/\.record\.js$/, '.java')
    fs.writeFile(javaFile, generateRecord(record), 'utf8')
  } catch (error) {
    console.error(error.stack) // eslint-disable-line no-console
  }
}

function run() {
  chokidar.watch('./**/*.record.js', {
    awaitWriteFinish: true,
  }).on('all', (event: Object, file: string) => {
    if (!/\.record\.js$/.test(file)) return
    console.log(`Regenerating ${file}...`) // eslint-disable-line no-console
    generateRecordForFile(path.resolve(file))
  })
}

if (!module.parent) run()

