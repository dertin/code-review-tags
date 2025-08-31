#!/bin/bash

# This script should be run from the project root directory

# Define directories
SRC_DIR="./src"
DIST_DIR="./dist/chrome"
PACKAGE_NAME="chrome-code-review-tags"

# Clean up previous builds
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

# Copy all source files (including nested content scripts)
cp -r "$SRC_DIR"/* "$DIST_DIR/"

# Create the ZIP file
(cd "$DIST_DIR" && rm -f "../../dist/$PACKAGE_NAME.zip" && zip -r -FS "../../dist/$PACKAGE_NAME.zip" .)

echo "Package for Chrome created at: dist/$PACKAGE_NAME.zip"
