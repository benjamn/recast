#!/usr/bin/env bash

set -ex

cd $(dirname $0)/data

if [ ! -d babylon-typescript-fixtures ]
then
    git clone --depth 1 https://github.com/babel/babel.git
    mv babel/packages/babylon/test/fixtures/typescript \
       babylon-typescript-fixtures
    rm -rf babel
fi

cd .. # back to the recast/test/ directory

exec mocha --reporter spec --full-trace $@ run.js
