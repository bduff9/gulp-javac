/*jshint esversion: 6 */

(function() {
  "use strict";

  let Duplex = require('stream').Duplex,
      Transform = require('stream').Transform;


  let forwardStream = function(source, destination) {
    source.pipe(new Transform({
      objectMode: true,
      transform(file, enc, next) {
        destination.push(file);
        next();
      },
      flush() {
        destination.push(null);
      }}));
  };


  var encapsulateStream = function(first, last) {
    let resultStream = new Duplex({
        readableObjectMode: true,
        writableObjectMode: true,
        read() { /* You can't tell me what to do. */ },
        write(file, enc, next) {
          first.write(file);
          next();
        }});

    resultStream.on('finish', function() {
      first.end();
      forwardStream(last, resultStream);
    });

    return resultStream;
  };

  module.exports.forwardStream = forwardStream;
  module.exports.encapsulateStream = encapsulateStream;
})();

