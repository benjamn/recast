#!/bin/sh

git filter-branch -f --env-filter '
export GIT_AUTHOR_NAME="Ben Newman"
export GIT_AUTHOR_EMAIL="bn@cs.stanford.edu"
export GIT_COMMITTER_NAME="Ben Newman"
export GIT_COMMITTER_EMAIL="bn@cs.stanford.edu"
' -- master
