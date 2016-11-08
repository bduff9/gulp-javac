/*jshint esversion: 6 */

(function() {
  "use strict";

  let Transform = require('stream').Transform;


  let fs = require('fs'),
      tmp = require('tmp'),
      path = require('path'),
      spawn = require('child_process').spawn,
      vinyl = require('vinyl-file'),
      lazypipe = require('lazypipe'),
      gulp = require('gulp'),
      gutil = require('gulp-util');


  let spawnlog = function(tool) {
    return function(data) {
      for (let line of data.toString().split('\n')) {
        gutil.log(tool + ':', line);
      }
    };
  };


  let tracer = function(tool, override) {
    return function(...message) {
      if (override || (override === undefined && compile.trace)) {
        gutil.log(tool + ':', ...message);
      }
    };
  };


  /**
   * Simple arguments are supplied via the function arguments. Source files
   * are piped in, but libraries need to be added via .addLibrary().
   *
   * There is currently no support for annotation processors. If you need it,
   * submit a patch.
   *
   * Options:
   *   debuggingInformation: debugging information to export. Either pass a
   *                         comma-delimited string or an array of strings.
   *                         Pass "*" to export all options.
   *                         Valid values: lines, source, var
   *                         (default: ['lines', 'source']).
   *   javaVersion: Java language version to target (default: 1.7).
   *   failOnWarning: Treat compile warnings as errors (default: false).
   *   noWarnings: Suppress warning messages (default: false).
   *   javacToolPath: Path to javac binary (default: javac on $PATH)
   *   verbose: Output verbose information (default: false)
   *   compilerOptions: Options passed to the java launcher called by javac
   *                    (default: []).
   */
  var javac = function({
      debuggingInformation = ['lines', 'source'],
      javaVersion = '1.7',
      failOnWarning = false,
      noWarnings = false,
      javacToolPath = 'javac',
      verbose = false,
      traceEnabled = undefined,
      javacCompilerFlags = []} = {}) {

    let trace = tracer('javac', traceEnabled);

    // List of all the promises that need to be fulfilled before we can run.
    let pendingWork = [];

    // List of libraries referenced.
    let libraries = [];

    let sources = [];

    // Main transform stream for reading source files and writing class files.
    let compileStream = new Transform({
        readableObjectMode: true,
        writableObjectMode: true,
        transform(file, enc, next) {
          trace('Source file:', file.path, sources);
          sources.push(file.path);
          next();
        },
        flush(next) {
          Promise.all(pendingWork)
            .then(function() {
              // javac option file for source files.
              let sourceFile = tmp.fileSync(),
                  sourceFileStream = fs.createWriteStream(null, {fd: sourceFile.fd});

              for (let source of sources) {
                sourceFileStream.write(`"${source}"\n`);
              }

              sourceFileStream.end();
              trace('Source File Path:', sourceFile.name);

              // javac option file for other arguments.
              let argFile = tmp.fileSync(),
                  argFileStream = fs.createWriteStream(null, {fd: argFile.fd});

              // Output folder for .class files.
              let outputFolder = tmp.dirSync({unsafeCleanup: false}).name;
              argFileStream.write(`-d "${outputFolder}"\n`);

              for (let flag of javacCompilerFlags) {
                argFileStream.write(`-J${flag}\n`);
              }

              if (typeof debuggingInformation != "string") {
                debuggingInformation = (debuggingInformation || []).join(',') || 'none';
              }
              if (debuggingInformation == "*") {
                argFileStream.write(`-g\n`);
              } else {
                argFileStream.write(`-g:${debuggingInformation}\n`);
              }

              if (verbose) argFileStream.write('-verbose\n');
              if (noWarnings) argFileStream.write('-nowarn\n');
              if (failOnWarning) argFileStream.write('-Werror\n');

              if (javaVersion) {
                argFileStream.write(`-source ${javaVersion}\n`);
                argFileStream.write(`-target ${javaVersion}\n`);
              }

              for (let library of libraries) {
                argFileStream.write(`-classpath "${library}"\n`);
              }

              argFileStream.end();
              trace('Argument File Path:', argFile.name);

              // And here... we... go...
              trace('javac', 'Executing:', javacToolPath);
              let javacProc = spawn(javacToolPath, [
                  '@' + argFile.name,
                  '@' + sourceFile.name]);

              javacProc.stdout.on('data', spawnlog('javac'));
              javacProc.stderr.on('data', spawnlog('javac'));

              javacProc.on('close', function(code) {
                trace('javac', 'javac complete; code:', code);
                if (code !== 0) {
                  throw new gutil.PluginError('gulp-javac', 'javac failed');
                } else {
                  gulp.src(path.join(outputFolder, '**'), {nodir: true})
                    .on('data', function(chunk) { compileStream.push(chunk); })
                    .on('end', next);
                }
              });
            })
            .catch(function(error) {
              gutil.log(error);
              throw new gutil.PluginError('gulp-javac', 'javac failed');
            });
        }});

    /** Adds a library path. Accepts string, string[], or source stream. */
    compileStream.addLibraries = function(source) {
      trace('Adding library:', source);
      // Make string-y things into source stream.
      if (typeof source == "string" || Array.isArray(source)) {
        source = gulp.src(source);
      }

      // Pipe all libraries directly to the option stream.
      source.on('data', function(file) {
        trace('Library added:', file.path);
        libraries.push(file.path);
      });

      // Add waiting for all libraries to the promises.
      pendingWork.push(new Promise(function(fulfill, reject) {
        source.on('end', function() {
          trace('javac', 'Library stream complete');
          fulfill();
        });
      }));
      return compileStream;
    };

    return compileStream;
  };

  /**
   * Prepares a jar file.
   *
   * Source class files are piped in and are expected to have correct relative
   * paths. Simple arguments are supplied via the function arguments.
   *
   * Options:
   *   jarName: filename of the jar to create (required).
   *   omitManifest: Skip writing a manifest (default: false)
   *   entrypoint: Application entry-point (default: none)
   *   jarToolPath: Path to jar binary (default: jar on $PATH)
   *   verbose: Output verbose information (default: false)
   *   jarCompilerFlags: Options passed to the java launcher called by jar
   *                    (default: []).
   */
  var jar = function(jarName, {
      omitManifest = false,
      entrypoint = null,
      jarToolPath = 'jar',
      verbose = false,
      traceEnabled = undefined,
      jarCompilerFlags = []} = {}) {

    let trace = tracer('jar', traceEnabled);

    let jarPath, jarFolder;

    let jarStream = new Transform({
        readableObjectMode: true,
        writableObjectMode: true,
        transform(file, enc, next) {
          let args = [];
          let options = ['u', 'f'];
          if (!jarPath) {
            jarFolder = tmp.dirSync({unsafeCleanup: true}).name
            jarPath = path.join(jarFolder, jarName);

            trace('Creating jar:', jarPath);

            options = ['c', 'f'];
            if (entrypoint) {
              options.push('e');
              args.push(entrypoint);
            }
          }

          if (verbose) options.push('v');
          if (omitManifest) options.push('M');

          args.push('-C', file.base, file.relative);

          args.unshift(jarPath);
          args.unshift(options.join(''));

          // And here... we... go...
          trace('Executing:', jarToolPath, args);

          let jarProc = spawn(jarToolPath, args);

          jarProc.stdout.on('data', spawnlog('jar'));
          jarProc.stderr.on('data', spawnlog('jar'));

          jarProc.on('close', function(code) {
            trace('jar complete; code:', code);
            if (code !== 0) {
              jarStream.emit('jar failed');
              jarStream.push(null);
            }
            next();
          });
        },
        flush(next) {
          vinyl.read(jarPath, { base: jarFolder })
            .then(function(file) {
                jarStream.push(file)
                jarStream.push(null);
                next();
              });
        }});

    return jarStream;
  };


  var compile = function(jarName, options) {
    return lazypipe()
      .pipe(javac, options)
      .pipe(jar, jarName, options)();
  };

  module.exports = compile;
  module.exports.compile = compile;
  module.exports.javac = javac;
  module.exports.jar = jar;
  module.exports.trace = false;
})();

