#!/usr/bin/env bash

set -ex

cd $(dirname $0)/data

BAB_TAG=v$(node -p 'require("@babel/parser/package.json").version')

if [ ! -d babel-parser ]
then
    git clone --branch "$BAB_TAG" --depth 1 \
        https://github.com/babel/babel.git
    mv babel/packages/babel-parser .
    rm -rf babel
fi

if [ ! -d graphql-tools-src ]
then
    git clone https://github.com/apollographql/graphql-tools.git
    pushd graphql-tools
    git reset --hard 90e37c477225e56edfacc9f2a1a8336c766de93b
    popd
    mv graphql-tools/src \
       graphql-tools-src
    rm -rf graphql-tools
fi

cd .. # back to the recast/test/ directory

exec mocha --reporter spec --full-trace $@ run.js
