#!/usr/bin/env babel-node
/* @flow */

import map from 'lodash.map'
import upperFirst from 'lodash.upperfirst'
import some from 'lodash.some'
import pickBy from 'lodash.pickby'
import size from 'lodash.size'

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

function getterName(name: string, {type, getterName}: Field): string {
  if (getterName) return getterName
  return `${type.toLowerCase() === 'boolean' ? 'is' : 'get'}${upperFirst(name)}`
}

function generateKeys(record: Record): string {
  const nonFlagFields = pickBy(record.fields, field => field.type !== 'flag')
  return map(nonFlagFields, (field: Field, name: string): string => {
    const {description} = field
    return `
  /**
   * Key for ${description || name}.
   */
  public static final String ${name} = "${name}";
  `
  }).join('')
}

function generateInitializers(record: Record): string {
  const nonFlagFields = pickBy(record.fields, field => field.type !== 'flag')
  const fieldsWithInitValue = pickBy(nonFlagFields, ({initValue}: Field): boolean => Boolean(initValue))
  if (!Object.keys(fieldsWithInitValue).length) {
    return `
  static final PersistentHashMap<String, Object> initialData = PersistentHashMap.emptyMap();
  `
  }

  const initializers = map(fieldsWithInitValue, ({initValue}: Field, name: string): string => {
    return `    init.plus(${name}, ${initValue || ''});`
  }).join('\n')

  return `
  static final PersistentHashMap<String, Object> initialData;
  static {
    @SuppressWarnings("unchecked")
    TransientMap<String, Object> init = PersistentHashMap.emptyMap().asTransient();
${initializers}
    initialData = (PersistentHashMap<String, Object>) init.persist();
  }
  `
}

function generateGetters(record: Record, className?: string = record.name): string {
  return map(record.fields, (field: Field, name: string): string => {
    const {type, description} = field
    const prefix = className === record.name ? '' : record.name + '.'
    return `
  /**
   * @return ${description || name}.
   */
  public ${type === 'flag' ? 'boolean' : type} ${getterName(name, field)}() {
    return ${type === 'flag' ? `getFlag(${prefix}Flags.${name})` : `get(${prefix}${name})`};
  }
  `
  }).join('')
}

function generateSetters(record: Record, className?: string = record.name): string {
  return map(record.fields, (field: Field, name: string): string => {
    const {type, description} = field
    const prefix = className === record.name ? '' : record.name + '.'
    return `
  /**
   * Sets ${description || name}.
   *
   * @param ${name} - the new value for ${description || name}
   * 
   * @return this {@code ${record.name}} if {@code ${name}} is unchanged, or a copy with the new {@code ${name}}.
   */
  public ${className} set${upperFirst(name)}(${type === 'flag' ? 'boolean' : type} ${name}) {
    return ${type === 'flag' ? `setFlag(${prefix}Flags.${name}, ${name})` : `set(${record.name}.${name}, ${name})`};
  }
  `
  }).join('')
}

function generateUpdaters(record: Record, className?: string = record.name): string {
  return map(record.fields, (field: Field, name: string): string => {
    const {type, description} = field
    const box = type === 'flag' ? 'Boolean' : boxes[type] || type
    const prefix = className === record.name ? '' : record.name + '.'
    return `
  /**
   * Updates ${description || name}.
   *
   * @param updater - {@code Function} that takes the current value of {@code ${name}} and returns the new value for {@code ${name}}.
   * 
   * @return this {@code ${className}} if {@code ${name}} is unchanged, or a copy with the updated {@code ${name}}.
   */
  public ${className} update${upperFirst(name)}(Function<${box}, ${box}> updater) {
    return ${type === 'flag' ? `updateFlag(${prefix}Flags.${name}, updater)` : `update(${prefix}${name}, updater)`};
  }
  `
  }).join('')
}

function generateProperties(record: Record): string {
  let properties = map(record.fields, (field: Field, name: string): string => {
    const {type, description} = field
    const box = type === 'flag' ? 'Boolean' : boxes[type] || type
    return `
    /**
     * ${description || name}
     */
    public static final DefaultProperty<${record.name}, ${box}> ${name} = create(
      "${name}", ${/^[^<]+/.exec(box)[0]}.class,
      r -> ${type === 'flag' ? `r.getFlag(Flags.${name})` : `r.get(${record.name}.${name})`},
      (m, v) -> ${type === 'flag' ? `m.setFlag(Flags.${name}, v)` : `m.set(${record.name}.${name}, v)`}
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

function generateFlagMethods(record: Record, className?: string = record.name): string {
  const prefix = className === record.name ? '' : record.name + '.'
  return `
  public boolean getFlag(long flag) {
    return ((long) get(${prefix}flags) & flag) != 0;
  }
  
  public ${className} setFlag(long flag, boolean value) {
    return update(${prefix}flags, bits -> value ? ((long) bits) | flag : ((long) bits) & ~flag); 
  }
  
  public ${className} updateFlag(long flag, Function<Boolean, Boolean> updater) {
    return setFlag(flag, updater.apply(getFlag(flag)));
  }
  `
}

function generateFlags(record: Record, className?: string = record.name): string {
  const flagFields = pickBy(record.fields, field => field.type === 'flag')
  if (!size(flagFields)) return ''
  let index = 0
  let flags = map(flagFields, (field: Field, name: string): string => {
    const {description} = field
    return `
    /**
     * ${description || name}
     */
    public static final long ${name} = ${1 << index++};
    `
  }).join('\n')

  return `
  public static final class Flags {
    ${flags}
  }
  ${generateFlagMethods(record, className)}
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
    'java.util.function.Function',
    'java.util.Objects',
    'com.github.krukow.clj_lang.PersistentHashMap',
  ]

  const flagFields = pickBy(record.fields, field => field.type === 'flag')
  if (size(flagFields)) {
    const fields = record.fields || (record.fields = {})
    fields.flags = {
      name: 'flags',
      type: 'long',
      initValue: map(flagFields, (field: Field, name: string) => `Flags.${name}`).join(' | ') || '0',
    }
  }

  if (some(record.fields, (field: Field): boolean => Boolean(field.initValue))) {
    imports.push('com.github.krukow.clj_ds.TransientMap')
  }

  const hasArrays = some(record.fields, (field: Field, name: string): boolean => /\[\s*\]\s*$/.test(name))
  if (hasArrays) imports.push('java.util.Arrays')
  if (record.generateProperties) imports.push(
    'org.andork.model.DefaultProperty',
    'java.util.function.BiConsumer'
  )

  const javadoc = record.javadoc || `/**
 *
 */`

  const properties = record.generateProperties ? generateProperties(record) : ''
  const flags = generateFlags(record)

  return `/**
 * Generated from {@code ${sourceFile}} by java-record-generator on ${new Date().toLocaleString()}.
 * {@link ${homepage}}
 */
 
package ${pkg};

${imports.map(name => `import ${name};`).join('\n')}

${javadoc}
public final class ${name} {
  ${generateKeys(record)}
  ${generateInitializers(record)}
  ${properties} 
  ${flags}

	private final PersistentHashMap<String, Object> data;
	
	${name}(PersistentHashMap<String, Object> data) {
		this.data = data;
	}

	public ${name}() {
		this(initialData);
	}

	public Mutable${name} toMutable() {
		return new Mutable${name}(data);
	}

	public ${name} withMutations(Consumer<Mutable${name}> mutator) {
		Mutable${name} mutable = toMutable();
		mutator.accept(mutable);
		return mutable.dataEquals(data) ? this : mutable.toImmutable();
	}
	
	@SuppressWarnings("unchecked")
	public <T> T get(String key) {
		return (T) data.get(key);
	}

	public ${name} set(String key, Object newValue) {
		return withMutations(m -> m.set(key, newValue));
	}

	public <T> ${name} update(String key, Function<? super T, ? extends T> updater) {
		return set(key, updater.apply(get(key)));
	}

	@Override
	public int hashCode() {
		return data.hashCode();
	}

	@Override
	public boolean equals(Object obj) {
		if (this == obj) {
			return true;
		}
		if (obj == null) {
			return false;
		}
		if (obj instanceof ${name}) {
			return ((${name}) obj).data.equals(data);
		}
		if (obj instanceof Mutable${name}) {
			return ((Mutable${name}) obj).persist().equals(data);
		}
		return false;
	}
  
  ${generateGetters(record)}
  ${record.generateSetters ? generateSetters(record) : ''}
  ${record.generateUpdaters ? generateUpdaters(record) : ''}
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
    'com.github.krukow.clj_ds.TransientMap',
    'com.github.krukow.clj_lang.PersistentHashMap',
    'java.util.Objects',
    'java.util.function.Function',
  ]

  let flagMethods = ''

  const flagFields = pickBy(record.fields, field => field.type === 'flag')
  if (size(flagFields)) {
    const fields = record.fields || (record.fields = {})
    fields.flags = {
      name: 'flags',
      type: 'long',
      initValue: map(flagFields, (field: Field, name: string) => `Flags.${name}`).join(' | ') || '0',
    }
    flagMethods = generateFlagMethods(record, `Mutable${name}`)
  }

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
	private volatile PersistentHashMap<String, Object> persisted;
	private final TransientMap<String, Object> data;

	@SuppressWarnings("unchecked")
	Mutable${name}(PersistentHashMap<String, Object> data) {
		persisted = data;
		this.data = persisted.asTransient();
	}

	public Mutable${name}() {
		this(${name}.initialData);
	}

	boolean dataEquals(PersistentHashMap<String, Object> prevData) {
		return persisted == prevData;
	}

	PersistentHashMap<String, Object> persist() {
		if (persisted == null) {
			persisted = (PersistentHashMap<String, Object>) data.persist();
		}
		return persisted;
	}

	public ${name} toImmutable() {
		return new ${name}(persist());
	}

	@SuppressWarnings("unchecked")
	public <T> T get(String key) {
		return (T) persist().get(key);
	}
	
	private static boolean equals(Object a, Object b) {
	  if (a instanceof Number || b instanceof Number ||
	    a instanceof String || b instanceof String) {
	    return Objects.equals(a, b);
	  }
	  return a == b;
	}

	public Mutable${name} set(String key, Object value) {
		if (persisted != null && equals(value, persisted.get(key))) {
			return this;
		}
		persisted = null;
		data.plus(key, value);
		return this;
	}

	public <T> Mutable${name} update(String key, Function<? super T, ? extends T> updater) {
    @SuppressWarnings("unchecked")
		T oldValue = (T) persist().get(key);
		T newValue = updater.apply(oldValue);
		if (equals(oldValue, newValue)) {
			return this;
		}
		data.plus(key, newValue);
		return this;
	}

	public Mutable${name} delete(String key) {
		if (persisted != null && !persisted.containsKey(key)) {
			return this;
		}
		persisted = null;
		data.minus(key);
		return this;
	}
	
	${flagMethods}
  ${generateGetters(record, `Mutable${name}`)}
  ${generateSetters(record, `Mutable${name}`)}
  ${record.generateUpdaters ? generateUpdaters(record, `Mutable${name}`) : ''}
  ${extraMutableCode || ''}
}
`.replace(/ {2}/g, tab)
}
