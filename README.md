# java-record-generator

[![Build Status](https://travis-ci.org/jedwards1211/java-record-generator.svg?branch=master)](https://travis-ci.org/jedwards1211/java-record-generator)
[![Coverage Status](https://coveralls.io/repos/github/jedwards1211/java-record-generator/badge.svg?branch=master)](https://coveralls.io/github/jedwards1211/java-record-generator?branch=master)

I created this for my own personal use.  If you want more information about how to use it, feel free to open an issue.

## Quick Start

```
npm i -g java-record-generator
cd path/to/your/java/project
java-record-generator
```

`java-record-generator` watches `**/*.record.js` files inside your project and automatically generates `.java` files
with the corresponding name based upon the configuration in the `.record.js` files.

## Example config:

`src/main/java/org/breakout/model/SurveyTrip.record.js`:

```es6
module.exports = {
	imports: [
	  'java.util.List',
	  'java.util.Date',
	  'org.andork.unit.Unit',
	  'org.andork.unit.Angle',
	  'org.andork.unit.Length',
	],
	generateProperties: true,
	generateSetters: true,
	generateUpdaters: true,
	fields: {
		cave: {type: 'String', description: 'cave name'},
		name: {type: 'String', description: 'trip name'},
		date: {type: 'Date', description: 'trip date'},
		surveyNotes: {type: 'String', description: 'survey notes file path'},
		surveyors: {type: 'List<String>', description: 'surveyor names'},
		distanceUnit: {type: 'Unit<Length>', description: 'default length unit', initValue: 'Length.meters'},
		angleUnit: {type: 'Unit<Angle>', description: 'default angle unit', initValue: 'Angle.degrees'},
		overrideFrontAzimuthUnit: {type: 'Unit<Angle>', description: 'default frontsight azimuth unit'},
		overrideBackAzimuthUnit: {type: 'Unit<Angle>', description: 'default backsight azimuth unit'},
		overrideFrontInclinationUnit: {type: 'Unit<Angle>', description: 'default frontsight inclination unit'},
		overrideBackInclinationUnit: {type: 'Unit<Angle>', description: 'default backsight inclination unit'},
		backAzimuthsCorrected: {
			type: 'boolean',
			description: 'whether backsight azimuths are corrected',
			getterName: 'areBackAzimuthsCorrected',
		},
		backInclinationsCorrected: {
			type: 'boolean',
			description: 'whether backsight inclinations are corrected',
			getterName: 'areBackInclinationsCorrected',
		},
		declination: {type: 'String', description: 'magnetic declination'},
		distanceCorrection: {type: 'String', description: 'correction for shot distances'},
		frontAzimuthCorrection: {type: 'String', description: 'correction for frontsight azimuths'},
		frontInclinationCorrection: {type: 'String', description: 'correction for frontsight inclinations'},
		backAzimuthCorrection: {type: 'String', description: 'correction for backsight azimuths'},
		backInclinationCorrection: {type: 'String', description: 'correction for backsight inclinations'},
	}
}
```

