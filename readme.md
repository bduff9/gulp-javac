# gulp-javac

Compile java source and create jars from gulp.

## Install

    $ npm install --save-dev gulp-javac

## Usage

```js
javac = require('gulp-javac');

gulp.task('example', function() {
  return gulp.src('./src/**/*.java')
    .pipe(javac('example.jar').addLibraries('./lib/**/*.jar'))
    .pipe(gulp.dest('out'));
});
```

## API

### javac.javac([options])

Compiles source into a set a .class files. Input files are expected to be
java source files; directories are ignored.  Produces a stream of generated
files.

#### options
  
##### debuggingInformation

Type: `string` or `string[]`  
Default: `['lines', 'source']`

Sets the debugging information output to the class files. Valid values are
`'lines'`, `'source'`, and `'vars'`. Set this to `'none'`, `null` (or something
false-y) to not include any debugging information. Set this to `'*'` to include
all debugging information.

##### javaVersion

Type: `string`  
Default: *System default*

Sets the Java language version to use.  Example: `'1.7'`

##### failOnWarning

Type: `boolean`  
Default: `false`

Set to `true` for compilation to fail on compiler warnings.

##### noWarnings

Type: `boolean`  
Default: `false`

Set to `true` to not output compiler warnings.

##### javacToolPath

Type: `string`  
Default: *javac on $PATH*

Path to the javac compiler. If `javac` isn't on your $PATH, set this to the path.

##### verbose

Type: `boolean`  
Default: `false`

Set to `true` to include verbose javac output.

##### javacCompilerFlags

Type: `string[]`  
Default: `[]`

Flags to pass to the underlying javac runner.  See the `-J` flag in `man javac`.

##### traceEnabled

Type: `boolean`  
Default: `undefined` *(Uses module settings)*

Sets tracing for this particular step. This overrides the module-level setting.

#### addLibraries(source)

Adds libraries to the classpath for compilation against.

##### source

***Required***  
Type: `string` or `string[]` or readable stream of vinyl files

Libraries to add. If this is a `string` or `string[]` it is treated as a
glob spec and all files are added. Otherwise all files on the stream are
added.

### javac.jar(jarName, [options])

Builds a jar file from provided sources.  Expects a stream of jar contents
and will use relative paths for jar contents.  Produces a stream with just
the resulting jar.

#### jarName

*Required*
Base name of the jar file to create.

#### options
  
##### omitManifest

Type: `boolean`  
Default: `false`

Use `true` to direct the jar tool to not create a manifest.

##### entryPoint

Type: `string`  
Default: `undefined`

Set this to the full class name of the class to use when running the jar from the
command line.

##### jarToolPath

Type: `string`  
Default: *jar on $PATH*

Path to the jar tool. If `jar` isn't on your $PATH, set this to the path.

##### verbose

Type: `boolean`  
Default: `false`

Set to `true` to include verbose jar output.

##### traceEnabled

Type: `boolean`  
Default: `undefined` *(Uses module settings)*

Sets tracing for this particular step. This overrides the module-level setting.

##### jarCompilerFlags

Type: `string[]`  
Default: `[]`

Flags to pass to the underlying jar runner.  See the `-J` flag in `man jar`.

### javac(jarName, [options])

Convenience function for javac.javac(...) and javac.jar(...). These are equivalent:

```js
// Options.
javacOptions = {...};
jarOptions = {...};
jarName = '...';

// Manual method.
gulp.src(...)
   .pipe(javac.javac(javacOptions).addLibraries(...))
   .pipe(javac.jar(jarName, jarOptions));

// Automated method.
mergedOptions = require('underscore')
    .extend({}, javacOptions, jarOptions);

gulp.src(...)
   .pipe(javac(jarName, mergedOptions).addLibraries(...))
```

The only overlapping options are `verbose` and `traceEnabled`.  `jarName` is
passed to `jar()` and `options` is passed to both `javac` and `jar`.

### trace

Type: `boolean`  
Default: `false`

Module-level flag for tracing. Set to `true` to enable trace output. This is useful
when trying to diagnose a problem with compilation, or when developing the library.

## License

> The MIT License (MIT)

> Copyright (c) 2016 Paul Hounshell <paul.hounshell@gmail.com>

> Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

> The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

