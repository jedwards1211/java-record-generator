#!/usr/bin/env babel-node
/* @flow */

import map from 'lodash.map'
import upperFirst from 'lodash.upperfirst'
import some from 'lodash.some'

import {homepage} from '../package.json'

type Field = {
  type: string,
  description?: string,
  shouldSet?: (a: string, b: string) => string,
  initValue?: string,
  getterName?: string,
  isNotEqual?: (a: string, b: string) => string,
}

type Record = {
  name: string,
  pkg: string,
  sourceFile: string,
  generateProperties?: boolean,
  generateSetters?: boolean,
  generateUpdaters?: boolean,
  javadoc?: string,
  fields?: {[name: string]: Field},
  imports?: Array<string>,
  extraProperties?: string,
  extraImports?: Array<string>,
  extraCode?: string,
  extraMutableImports?: Array<string>,
  extraMutableCode?: string,
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

const shouldSetTests = {
  float: (a: string, b: string): string => `Float.floatToIntBits(${a}) == Float.floatToIntBits(${b})`,
  double: (a: string, b: string): string => `Double.doubleToLongBits(${a}) == Double.doubleToLongBits(${b})`,
}

function generateDataFields(record: Record): string {
  return map(record.fields, ({type, description, initValue}: Field, name: string): string => `
    /**
     * ${description || name}.
     */
    ${type} ${name}${initValue !== undefined ? ` = ${initValue}` : ''};
  `).join('')
}

function getterName(name: string, {type, getterName}: Field): string {
  if (getterName) return getterName
  return `${type.toLowerCase() === 'boolean' ? 'is' : 'get'}${upperFirst(name)}`
}

function generateShouldSet({type, shouldSet}: Field, oldValue: string, newValue: string): string {
  if (shouldSet) return shouldSet(oldValue, newValue)
  if (shouldSetTests[type]) return shouldSetTests[type](oldValue, newValue)
  return `${oldValue} == ${newValue}`
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
    if (${generateShouldSet(field, `data.${name}`, name)}) return this;
    detach();
    data.${name} = ${name};
    return this;
  }
  `
  }).join('')
}


function generateGetters(record: Record): string {
  return map(record.fields, (field: Field, name: string): string => {
    const {type, description} = field
    return `
  /**
   * @return ${description || name}.
   */
  public ${type} ${getterName(name, field)}() {
    return data.${name};
  }
  `
  }).join('')
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
    if (${generateShouldSet(field, `data.${name}`, name)}) return this;
    return toMutable().set${upperFirst(name)}(${name}).toImmutable();
  }
  `
  }).join('')
}

function generateUpdaters(record: Record, className?: string = record.name): string {
  return map(record.fields, (field: Field, name: string): string => {
    const {type, description} = field
    const box = boxes[type] || type
    return `
  /**
   * Updates ${description || name}.
   *
   * @param updater - {@code Function} that takes the current value of {@code ${name}} and returns the new value for {@code ${name}}.
   * 
   * @return this {@code ${className}} if {@code ${name}} is unchanged, or a copy with the updated {@code ${name}}.
   */
  public ${className} update${upperFirst(name)}(Function<${box}, ${box}> updater) {
    return set${upperFirst(name)}(updater.apply(data.${name}));
  }
  `
  }).join('')
}

function isArrayType(type: string): boolean {
  return /\[\s*\]\s*$/.test(type)
}

const hashCoders = {
  boolean: (name: string): string => `result = prime * result + (${name} ? 1231 : 1237);`,
  byte: (name: string): string => `result = prime * result + ${name};`,
  short: (name: string): string => `result = prime * result + ${name};`,
  char: (name: string): string => `result = prime * result + ${name};`,
  int: (name: string): string => `result = prime * result + ${name};`,
  long: (name: string): string => `result = prime * result + (int) (${name} ^ (${name} >>> 32));`,
  float: (name: string): string => `result = prime * result + Float.floatToIntBits(${name});`,
  double: (name: string): string => `long ${name}Bits = Double.doubleToLongBits(${name});
    result = prime * result + (int) (${name}Bits ^ (${name}Bits >>> 32));`,
}

function generateHashCode(record: Record): string {
  const meat = map(record.fields, (field: Field, name: string): string => {
    const {type} = field
    if (isArrayType(type)) return `result = prime * result + Arrays.hashCode(${name});`
    if (hashCoders[type]) return hashCoders[type](name)
    return `result = prime * result + Objects.hashCode(${name});`
  }).join('\n      ')

  return `
    @Override
    public int hashCode() {
      int prime = 31;
      int result = 0;
      ${meat}
      return result;
    }
  `
}

const isNotEqualTests = {
  boolean: (name: string): string => `if (${name} != other.${name}) return false;`,
  byte: (name: string): string => `if (${name} != other.${name}) return false;`,
  short: (name: string): string => `if (${name} != other.${name}) return false;`,
  char: (name: string): string => `if (${name} != other.${name}) return false;`,
  int: (name: string): string => `if (${name} != other.${name}) return false;`,
  long: (name: string): string => `if (${name} != other.${name}) return false;`,
  float: (name: string): string => `if (Float.floatToIntBits(${name}) != Float.floatToIntBits(other.${name})) return false;`,
  double: (name: string): string => `if (Double.doubleToIntBits(${name}) != Double.doubleToIntBits(other.${name})) return false;`,
}

function generateEquals(record: Record): string {
  const meat = map(record.fields, (field: Field, name: string): string => {
    const {type, isNotEqual} = field
    if (isNotEqual) return `if (${isNotEqual(name, `other.${name}`)}) return false;`
    if (isArrayType(type)) return `if (!Arrays.equals(${name}, other.${name})) return false;`
    if (isNotEqualTests[type]) return isNotEqualTests[type](name)
    return `if (!Objects.equals(${name}, other.${name})) return false;`
  }).join('\n      ')

  return `
    @Override
    public boolean equals(Object obj) {
      if (this == obj) return true;
      if (obj == null) return false;
      if (getClass() != obj.getClass()) return false;
      Data other = (Data) obj;
      ${meat}
      return true;
    }
  `
}

function generateHashCodeAndEquals({name}: Record): string {
  return `
  @Override
  public int hashCode() {
    return data.hashCode();
  }

  boolean dataIs(Data data) {
    return this.data == data;
  }

  boolean dataEquals(Data data) {
    return data.equals(data);
  }

  @Override
  public boolean equals(Object obj) {
    if (this == obj) return true;
    if (obj == null) return false;
    if (obj instanceof ${name}) return ((${name}) obj).dataEquals(data);
    if (obj instanceof Mutable${name}) return ((Mutable${name}) obj).dataEquals(data);
    return false;
  }
  `
}

function generateProperties(record: Record): string {
  let properties = map(record.fields, (field: Field, name: string): string => {
    const {type, description} = field
    const box = boxes[type] || type
    return `
    /**
     * ${description || name}
     */
    public static final DefaultProperty<${record.name}, ${box}> ${name} = create(
      "${name}", ${/^[^<]+/.exec(box)[0]}.class,
      r -> r.${getterName(name, field)}(),
      (m, v) -> m.set${upperFirst(name)}(v)
    );
    `
  }).join('\n')

  const {name, extraProperties} = record

  if (extraProperties) properties += '\n' + extraProperties

  return `
  public static final class Properties {
    public static <V> DefaultProperty<${name}, V> create(
        String name, Class<? super V> valueClass,
				Function<? super ${name}, ? extends V> getter, 
				BiConsumer<Mutable${name}, ? super V> setter) {
			return new DefaultProperty<${name}, V>(
        name, valueClass, getter, (m, v) -> {
          return m.withMutations(m2 -> setter.accept(m2, v));
        }
      );
		}
		
    ${properties}
  }
  `
}

type Options = {
  tab?: string,
}

export function generateRecord(record: Record, options?: Options = {}): string {
  const {name, pkg, sourceFile, extraCode} = record
  const tab = options.tab || '\t'
  const imports = [
    ...(record.imports || []),
    ...(record.extraImports || []),
    'java.util.function.Consumer',
    'java.util.Objects',
  ]

  const hasArrays = some(record.fields, (field: Field, name: string): boolean => /\[\s*\]\s*$/.test(name))
  if (hasArrays) imports.push('java.util.Arrays')
  if (record.generateProperties) imports.push(
    'org.andork.model.DefaultProperty',
    'java.util.function.BiConsumer'
  )
  if (record.generateUpdaters || record.generateProperties) imports.push('java.util.function.Function')

  const javadoc = record.javadoc || `/**
 *
 */`

  const properties = record.generateProperties ? generateProperties(record) : ''

  return `/**
 * Generated from {@code ${sourceFile}} by java-record-generator on ${new Date().toLocaleString()}.
 * {@link ${homepage}}
 */
 
package ${pkg};

${imports.map(name => `import ${name};`).join('\n')}

${javadoc}
public final class ${name} {
  ${properties}
  static final class Data implements Cloneable {
    static final Data initial = new Data();
    
    ${generateDataFields(record)}
    @Override
    public Data clone() {
      try {
        return (Data) super.clone(); 
      } catch (Exception e) {
        // should not happen
        throw new RuntimeException(e);
      } 
    }
    
    ${generateHashCode(record)}
    ${generateEquals(record)}
  }
 
  private volatile Data data;
  
  ${name}(Data data) {
    this.data = data;
  }
  
  public ${name}() {
    this(Data.initial);
  }
  
  /**
   * @param mutator a {@link Consumer} that applies mutations to this {@code ${name}}.
   *
   * @return a copy of this {@code ${name}} with the given mutations applied.
   */
  public ${name} withMutations(Consumer<Mutable${name}> mutator) {
    Mutable${name} mutable = toMutable();
    mutator.accept(mutable);
    return mutable.dataIs(data) ? this : mutable.toImmutable();
  }
  
  /**
   * @return a mutable copy of this {@code ${name}}.
   */
  public Mutable${name} toMutable() {
    return new Mutable${name}(data);
  }
  
  ${generateGetters(record)}
  ${record.generateSetters ? generateSetters(record) : ''}
  ${record.generateUpdaters ? generateUpdaters(record) : ''}
  ${generateHashCodeAndEquals(record)}
  ${extraCode || ''}
}
`.replace(/ {2}/g, tab)
}

export function generateMutableRecord(record: Record, options?: Options = {}): string {
  const {name, pkg, sourceFile, extraMutableCode} = record
  const tab = options.tab || '\t'
  const imports = [
    ...(record.imports || []),
    ...(record.extraMutableImports || []),
    `${pkg}.${name}.Data`,
  ]

  if (record.generateUpdaters) imports.push('java.util.function.Function')

  return `/**
 * Generated from {@code ${sourceFile}} by java-record-generator on ${new Date().toLocaleString()}.
 * {@link ${homepage}}
 */
 
package ${pkg};

${imports.map(name => `import ${name};`).join('\n')}

/**
 * The mutable version of {@link ${name}}.
 */
public final class Mutable${name} {
  private volatile boolean frozen = true;
  private volatile Data data;
  
  Mutable${name}(Data data) {
    this.data = data;
  }
  
  public Mutable${name}() {
    this(Data.initial);
  }
 
  public void detach() {
    if (frozen) {
      data = data.clone();
      frozen = false;
    }
  }
  
  /**
   * @return an immutable copy of this {@code Mutable${name}}.
   */
  public ${name} toImmutable() {
    frozen = true;
    return new ${name}(data);
  } 
  
  ${generateGetters(record)}
  ${generateMutableSetters(record)}
  ${record.generateUpdaters ? generateUpdaters(record, `Mutable${name}`) : ''}
  ${generateHashCodeAndEquals(record)}
  ${extraMutableCode || ''}
}
`.replace(/ {2}/g, tab)
}
