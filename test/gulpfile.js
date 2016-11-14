/*jshint esversion: 6 */

(function() {
  "use strict";

  let gulp = require('gulp'),
      javac = require('../javac');

  gulp.task('simple-manual', function() {
    return gulp.src('simple/**/*')
        .pipe(javac.javac())
        .pipe(javac.jar('simple-manual.jar', {entrypoint: "test_package.TestClass"}))
        .pipe(gulp.dest('out/'));
  });

  gulp.task('simple-combined', function() {
    return gulp.src('simple/**/*')
        .pipe(javac('deep/simple-combined.jar', {entrypoint: "test_package.TestClass"}))
        .pipe(gulp.dest('out/'));
  });

  gulp.task('default', ['simple-manual', 'simple-combined']);
})();

