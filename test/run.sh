#!/usr/bin/env bash

set -ex

cd $(dirname $0)

exec mocha --reporter spec --full-trace $@ run.js
