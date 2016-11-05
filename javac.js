/*jshint esversion: 6 */

(function() {
  "use strict";

  let Readable = require('stream').Readable,
      Duplex = require('stream').Duplex,
      Transform = require('stream').Transform;


  let fs = require('fs'),
      path = require('path'),
      gulp = require('gulp'),
      gutil = require('gulp-util'),
      tmp = require('tmp'),
      spawn = require('child_process').spawn,
      streamhelp = require('./stream-helpers');


  let spawnlog = function(tool) {
    return function(data) {
      for (let line of data.toString().split('\n')) {
        gutil.log(tool + ':', line);
      }
    };
  };


  let trace = function(tool, ...message) {
    if (compile.trace) {
      gutil.log(tool + ':', ...message);
    }
    return message;
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
      javacCompilerFlags = []} = {}) {

    trace('javac', 'Building javac task');

    // List of all the promises that need to be fulfilled before we can run.
    let pendingWork = [];

    // Output folder for .class files.
    let outputFolder = tmp.dirSync({unsafeCleanup: true}).name;

    // javac option file for source files.
    let sourceFile = tmp.fileSync(),
        sourceFileStream = fs.createWriteStream(null, {fd: sourceFile.fd});

    trace('javac', 'Source File Path:', sourceFile.name);

    // javac option file for other arguments.
    let argFile = tmp.fileSync(),
        argFileStream = fs.createWriteStream(null, {fd: argFile.fd});

    trace('javac', 'Argument File Path:', argFile.name);

    // Build argFile with what we can so far.
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

    if (verbose) argFileStream.write('-verbose');
    if (noWarnings) argFileStream.write('-nowarn');
    if (failOnWarning) argFileStream.write('-Werror');

    trace('javac', 'Simple arguments set up');

    // Main transform stream for reading source files and writing class files.
    let compileStream = new Duplex({
        readableObjectMode: true,
        writableObjectMode: true,
        read() { /* You can't tell me what to do. */ },
        write(file, enc, next) {
          trace('javac', 'Source file:', file.path);
          sourceFileStream.write(`"${file.path}"\n`);
          next();
        }});

    // Add waiting for all source files to the promises.
    pendingWork.push(new Promise(function(fulfill, reject) {
      compileStream.on('finish', function() {
        trace('javac', 'Input stream consumed');
        fulfill();
      });
    }));

    /** Adds a library path. Accepts string, string[], or source stream. */
    compileStream.addLibraries = function(source) {
      trace('javac', 'Adding library:', source);
      // Make string-y things into source stream.
      if (typeof source == "string" || Array.isArray(source)) {
        source = gulp.src(source);
      }

      // Pipe all libraries directly to the option stream.
      source.on('data', function(file) {
        trace('javac', 'Library added:', file.path);
        argFileStream.write(`-classpath "${file.path}"\n`);
      });

      // Add waiting for all libraries to the promises.
      pendingWork.push(new Promise(function(fulfill, reject) {
        source.on('end', function() {
          trace('javac', 'Library stream complete');
          fulfill();
        });
      }));
    };

    Promise.all(pendingWork)
      .then(function() {
        trace('javac', 'All source and library streams complete');

        // Streams are complete, button them up.
        fs.close(argFile.fd);
        fs.close(sourceFile.fd);

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
            compileStream.emit('javac failed');
            compileStream.push(null);
          } else {
            streamhelp.forwardStream(
              gulp.src(outputFolder + '/**', {nodir: true}),
              compileStream);
          }
        });
      })
      .catch(function(error) {
          gutil.log(error);
          compileStream.emit(error);
          compileStream.push(null);
        });

    trace('javac', 'javac task built');

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
      jarCompilerFlags = []} = {}) {

    trace('jar', 'Building jar task');

    let classPaths = {};

    let jarStream = new Duplex({
        readableObjectMode: true,
        writableObjectMode: true,
        read() { /* You can't tell me what to do. */ },
        write(file, enc, next) {
          trace('jar', 'Source file:', file.path);
          if (!(file.base in classPaths)) {
            trace('jar', 'New jar folder:', file.base);
            classPaths[file.base] = [];
          }

          trace('jar', 'Source file:', file.path);
          classPaths[file.base].push(file.relative);
          next();
        }});

    jarStream.on('finish', function() {
      trace('jar', 'Input stream consumed');

      // Time to build the jar.
      let jarFile = path.join(
        tmp.dirSync({unsafeCleanup: true}).name,
        jarName);

      let options = ['c', 'f'];
      let args = [jarFile];

      if (verbose) options.push('v');
      if (omitManifest) options.push('M');

      if (entrypoint) {
        options.push('e');
        args.push(entrypoint);
      }

      for (let base in classPaths) {
        args.push('-C', base);

        for (let file of classPaths[base]) {
          args.push(file);
        }
      }

      args.unshift(options.join(''));
      trace('jar', 'Arguments:', args);

      // And here... we... go...
      trace('jar', 'Executing:', jarToolPath);
      let jarProc = spawn(jarToolPath, args);

      jarProc.stdout.on('data', spawnlog('jar'));
      jarProc.stderr.on('data', spawnlog('jar'));

      jarProc.on('close', function(code) {
        trace('jar', 'jar complete; code:', code);
        if (code !== 0) {
          jarStream.emit('jar failed');
          jarStream.push(null);
        } else {
          streamhelp.forwardStream(gulp.src(jarFile), jarStream);
        }
      });
    });

    trace('jar', 'Jar task built');

    return jarStream;
  };


  var compile = function(jarName, options) {
    let javacStream = javac(options);
    let jarStream = javacStream.pipe(jar(jarName, options));

    let compileStream = streamhelp.encapsulateStream(
      javacStream, javacStream.pipe(jar(jarName, options)));

    compileStream.addLibraries = javacStream.addLibraries.bind(javacStream);

    return compileStream;
  };

  module.exports = compile;
  module.exports.compile = compile;
  module.exports.javac = javac;
  module.exports.jar = jar;
  module.exports.trace = false;
})();

