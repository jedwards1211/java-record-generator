#!/usr/bin/env babel-node
/* @flow */

import map from 'lodash.map'
import upperFirst from 'lodash.upperfirst'
import some from 'lodash.some'
import chokidar from 'chokidar'
import path from 'path'
import fs from 'fs'

type Field = {
  type: string,
  description?: string,
  compare?: (a: string, b: string) => string,
  initValue?: string,
}

type Record = {
  name: string,
  pkg: string,
  javadoc?: string,
  fields: {[name: string]: Field},
}

const boxes = {
  boolean: 'Boolean',
  byte: 'Byte',
  short: 'Short',
  char: 'Character',
  int: 'Integer',
  long: 'Long',
  float: 'Float',
  double: 'Double',
}

/* eslint-disable flowtype/require-parameter-type */
const comparePrimitives = {
  boolean: (a, b) => `${a} == ${b}`,
  byte: (a, b) => `${a} == ${b}`,
  short: (a, b) => `${a} == ${b}`,
  char: (a, b) => `${a} == ${b}`,
  int: (a, b) => `${a} == ${b}`,
  long: (a, b) => `${a} == ${b}`,
  float: (a, b) => `${a} == ${b} || (Float.isNaN(${a}) && Float.isNaN(${b}))`,
  double: (a, b) => `${a} == ${b} || (Double.isNaN(${a}) && Double.isNaN(${b}))`,
}
/* eslint-enable flowtype/require-parameter-type */

function generateMutableFields(record: Record): string {
  return map(record.fields, ({type, description, initValue}: Field, name: string): string => `
    /**
     * ${description || name}.
     */
    private ${type} ${name}${initValue !== undefined ? ` = ${initValue}` : ''};
  `).join('')
}

function generateMutableGetters(record: Record): string {
  return map(record.fields, ({type, description}: Field, name: string): string => `
    /**
     * @return ${description || name}.
     */
    public ${type} ${type.toLowerCase() === 'boolean' ? 'is' : 'get'}${upperFirst(name)}() {
      return ${name};
    }
  `).join('')
}

function generateCompare({type, compare}: Field, oldValue: string, newValue: string): string {
  if (compare) return compare(oldValue, newValue)
  if (comparePrimitives[type]) return comparePrimitives[type](oldValue, newValue)
  return `Objects.equals(${oldValue}, ${newValue})`
}

function generateMutableSetters(record: Record): string {
  return map(record.fields, (field: Field, name: string): string => {
    const {type, description} = field
    return `
    /**
     * Sets ${description || name}.
     *
     * @param ${name} - the new value for ${description || name}
     * 
     * @return this {@code Mutable${record.name}}.
     */
    public Mutable${record.name} set${upperFirst(name)}(${type} ${name}) {
      if (${generateCompare(field, `this.${name}`, name)}) return this;
      modCount++;
      this.${name} = ${name};
      return this;
    }
    `
  }).join('')
}

function generateMutableUpdaters(record: Record): string {
  return map(record.fields, (field: Field, name: string): string => {
    const {type, description} = field
    const box = boxes[type] || type
    return `
    /**
     * Updates ${description || name}.
     *
     * @param updater - {@code Function} that takes the current value of {@code ${name}} and returns the new value for {@code ${name}}.
     * 
     * @return this {@code ${record.name}} if {@code ${name}} is unchanged, or a copy with the updated {@code ${name}}.
     */
    public Mutable${record.name} update${upperFirst(name)}(Function<${box}, ${box}> updater) {
      return set${upperFirst(name)}(updater.apply(${name}));
    }
    `
  }).join('')
}

function generateGetters(record: Record): string {
  return map(record.fields, ({type, description}: Field, name: string): string => `
  /**
   * @return ${description || name}.
   */
  public ${type} ${type.toLowerCase() === 'boolean' ? 'is' : 'get'}${upperFirst(name)}() {
    return data.${name};
  }
`).join('')
}

function generateSetters(record: Record): string {
  return map(record.fields, (field: Field, name: string): string => {
    const {type, description} = field
    return `
  /**
   * Sets ${description || name}.
   *
   * @param ${name} - the new value for ${description || name}
   * 
   * @return this {@code ${record.name}} if {@code ${name}} is unchanged, or a copy with the new {@code ${name}}.
   */
  public ${record.name} set${upperFirst(name)}(${type} ${name}) {
    if (${generateCompare(field, `data.${name}`, name)}) return this;
    return new ${record.name}(data.clone().set${upperFirst(name)}(${name}));
  }
  `
  }).join('')
}

function generateUpdaters(record: Record): string {
  return map(record.fields, (field: Field, name: string): string => {
    const {type, description} = field
    const box = boxes[type] || type
    return `
  /**
   * Updates ${description || name}.
   *
   * @param updater - {@code Function} that takes the current value of {@code ${name}} and returns the new value for {@code ${name}}.
   * 
   * @return this {@code ${record.name}} if {@code ${name}} is unchanged, or a copy with the updated {@code ${name}}.
   */
  public ${record.name} update${upperFirst(name)}(Function<${box}, ${box}> updater) {
    return set${upperFirst(name)}(updater.apply(data.${name}));
  }
  `
  }).join('')
}

export function generateRecord(record: Record): string {
  const {name, pkg} = record
  const javadoc = record.javadoc || `/**
 *
 */`

  const importObjects = some(record.fields, (field: Field): boolean =>
    /Objects\.equals/.test(generateCompare(field, 'a', 'b'))
  )

  return `
package ${pkg};

/**
 * Generated by java-record-generator on ${new Date().toLocaleString()}.
 */
 
${importObjects ? 'import java.util.Objects;' : ''}
import java.util.function.Consumer;
import java.util.function.Function;

${javadoc}
public class ${name} {
  public static class Mutable${name} implements Cloneable {
    private int modCount = 0; 
    ${generateMutableFields(record)}
    ${generateMutableGetters(record)}
    ${generateMutableSetters(record)}
    ${generateMutableUpdaters(record)}
    @Override
    public Mutable${name} clone() {
      try {
        return (Mutable${name}) super.clone(); 
      } catch (Exception e) {
        // should not happen
        throw new RuntimeException(e);
      } 
    }
  }
  
  private final Mutable${name} data;
  
  private ${name}(Mutable${name} data) {
    this.data = data;
  }
  
  public ${name}() {
    this(new Mutable${name}());
  }
  
  public boolean equals(Object o) {
    return o == this;
  }
  
  /**
   * @param mutator a {@link Consumer} that applies mutations to this {@code ${name}}.
   *
   * @return a copy of this {@code ${name}} with the given mutations applied.
   */
  public ${name} withMutations(Consumer<Mutable${name}> mutator) {
    Mutable${name} newData = data.clone(); 
    mutator.accept(newData);
    return newData.modCount == data.modCount ? this : new ${name}(newData);
  }
  
  /**
   * @param mutator a {@link Function} that applies mutations to this {@code ${name}}.
   *
   * @return a copy of this {@code ${name}} with the given mutations applied.
   */
  public ${name} withMutations(Function<Mutable${name}, Mutable${name}> mutator) {
    return withMutations(m -> { mutator.apply(m); });
  }
  ${generateGetters(record)}
  ${generateSetters(record)}
  ${generateUpdaters(record)}
}
`
}

function getPackageName(file: string): string {
  const dir = path.dirname(file)
  return dir.substring(/\b(org|com|javax?|apple|sun|jdk)\b/.exec(dir).index).replace(/[\/\\]/g, '.')
}

function generateRecordForFile(file: string) {
  delete require.cache[require.resolve(file)]
  const record = require(file)
  record.name = /(\w+)\.record\.js$/.exec(file)[1]
  record.pkg = getPackageName(file)
  const javaFile = file.replace(/\.record\.js$/, '.java')
  fs.writeFile(javaFile, generateRecord(record), 'utf8')
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

