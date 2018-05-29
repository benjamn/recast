#!/usr/bin/env bash

set -ex

cd $(dirname $0)/data

BAB_TAG=v$(node -p 'require("babylon/package.json").version')

if [ ! -d babylon ]
then
    git clone --branch "$BAB_TAG" --depth 1 \
        https://github.com/babel/babel.git
    mv babel/packages/babylon .
    rm -rf babel
fi

if [ ! -d graphql-tools-src ]
then
    git clone --depth 1 https://github.com/apollographql/graphql-tools.git
    pushd graphql-tools
    git fetch origin refs/pull/807/merge:pull/807/merge
    git checkout pull/807/merge
    popd
    mv graphql-tools/src \
       graphql-tools-src
    rm -rf graphql-tools
fi

cd .. # back to the recast/test/ directory

exec mocha --reporter spec --full-trace $@ run.js
