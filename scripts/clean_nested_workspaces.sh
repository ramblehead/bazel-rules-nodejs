#!/usr/bin/env bash

set -eu -o pipefail
# -e: exits if a command fails
# -u: errors if an variable is referenced before being set
# -o pipefail: causes a pipeline to produce a failure return code if any command errors

echo_and_run() { echo "+ $@" ; "$@" ; }

readonly RULES_NODEJS_DIR=$(cd $(dirname "$0")/..; pwd)
cd $RULES_NODEJS_DIR
echo_and_run bazel clean --expunge

readonly workspaceRoots=("e2e" "examples" "packages")
for workspaceRoot in ${workspaceRoots[@]} ; do
  (
    readonly workspaceFiles=($(find ./${workspaceRoot} -maxdepth 3 -type f -name WORKSPACE -prune))
    for workspaceFile in ${workspaceFiles[@]} ; do
      (
        readonly workspaceDir=$(dirname ${workspaceFile})
        printf "\n\nCleaning ${workspaceDir}\n"
        cd ${workspaceDir}
        echo_and_run rm -rf `find . -maxdepth 1 -type d -name node_modules -prune`
        echo_and_run bazel clean --expunge
      )
    done
  )
done
