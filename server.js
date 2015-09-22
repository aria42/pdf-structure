'use strict';

var express = require('express');

var app = express();

app.use(express.static(process.cwd()));

app.listen('8000', function() {
  console.log('Development server listening at http://localhost:8000');
});
