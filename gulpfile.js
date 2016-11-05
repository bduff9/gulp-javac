/*jshint esversion: 6 */

(function() {
  "use strict";

  let gulp = require('gulp'),
      debug = require('gulp-debug'),
      jshint = require('gulp-jshint'),
      spawn = require('child_process').spawn,
      javac = require('./javac');

  gulp.task('lint', function() {
    return gulp.src(['**/*.js', '**/*.json', '!node_modules/**'])
      .pipe(jshint())
      .pipe(jshint.reporter('default'));
  });

  gulp.task('test-simple', function() {
    return gulp.src(['test/**/*.java', '!test/**/-*'])
        .pipe(debug({title: 'before'}))
        .pipe(javac.javac({verbose: true}))
        .pipe(debug({title: 'after'}))
        .pipe(javac.jar('test-simple.jar', {verbose: true}))
        .pipe(debug({title: 'jar'}))
        .pipe(gulp.dest('out/'));
  });

  gulp.task('test-combined', function() {
    return gulp.src(['test/**/*.java', '!test/**/-*'])
        .pipe(debug({title: 'before'}))
        .pipe(javac('test-combined.jar', {entrypoint: "test_package.TestClass"}))
        .pipe(debug({title: 'jar'}))
        .pipe(gulp.dest('out/'));
  });

  gulp.task('default', ['lint', 'test-combined']);

  gulp.task('continuous', function() {
    let p;

    gulp.watch('./**/*.js', spawnChild);
    spawnChild();

    function spawnChild(e) {
      if (p) {
        p.kill();
      }

      p = spawn('gulp', ['default'], {stdio: 'inherit'});
    }
  });
})();

