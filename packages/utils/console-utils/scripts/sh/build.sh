#!/bin/bash

FULL=
SKIP_INDEX_TS=
while test $# -gt 0; do
	case "$1" in
		--skipIndexTs) SKIP_INDEX_TS="true"; shift; ;;
		--full|-f) FULL="true"; shift; ;;
		*) break; ;;
	esac
done

# ensure repo root folder
if [ ! -d "./.git" ]; then
	while [ ! -d "./.git" ]; do
		cd ..
	done
	echo "cd $(pwd)"
fi

repoName="$(basename -- "$(pwd)")"
echo "Building: $repoName ..."

# make sure we have something to build
if [ ! -f "./tsconfig.json" ]; then
	echo "Nothing to Build."
	exit 0
fi

if [ ! -z "$FULL" ]; then
	# scrub build folders
	echo "Scrubbing build folders ..."
	find . -type d -name 'build' -not -path './node_modules/*' -not -path './packages/*'  -exec rm -rf {} +

	# scrub build info
	echo "Scrubbing tsbuildinfo files ..."
	find . -type f -name '*.tsbuildinfo' -not -path './node_modules/*' -exec rm -rf {} +
fi

# we have a known issue with this lib needing this "declare module"
if [ -d "./node_modules/pdf2json" ]; then
	if [ ! -f "./node_modules/pdf2json/index.d.ts" ]; then
		echo "Creating: ./node_modules/pdf2json/index.d.ts";
		echo 'declare module "pdf2json";' > ./node_modules/pdf2json/index.d.ts
	fi
fi

SCRIPT_DIR="./scripts"
if [ -d "./node_modules/@rsc-utils/console-utils" ]; then
	SCRIPT_DIR="./node_modules/@rsc-utils/console-utils/scripts"
fi
INDEX_MJS="$SCRIPT_DIR/mjs/index.mjs"

# create all the index.ts files ... unless skipped
if [ -z "$SKIP_INDEX_TS" ]; then
	echo "Generating index.ts files ..."
	node "$INDEX_MJS" indexTs -r
	if [ "$?" != "0" ]; then echo "Build Failed!"; exit 1; fi
else
	echo "Skipping: Generating index.ts files ..."
fi

# transpile the TS
echo "Building tsconfig.json ..."
tsc --build tsconfig.json
if [ "$?" != "0" ]; then echo "Build Failed!"; exit 1; fi

# build out the .d.ts files that exclude the private/internal docs
if [ -f "./tsconfig.d.json" ]; then
	echo "Building tsconfig.d.json ..."
	tsc --build tsconfig.d.json
	if [ "$?" != "0" ]; then echo "Build Failed!"; exit 1; fi
fi

# iterate packages to fix documentation
if [ -d "./packages" ]; then
	rootDir="$(pwd)"
	for dir in ./packages/*/*; do
		cd "$rootDir/$dir"
		if [ -f "./tsconfig.d.json" ]; then
			echo "Building $dir/tsconfig.d.json ..."
			tsc --build tsconfig.d.json
		fi
	done
fi

echo "Building: $repoName ... done."
