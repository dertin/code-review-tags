#!/bin/bash

# This script should be run from the project root directory

# Define directories
SRC_DIR="./src"
DIST_DIR="./dist/firefox"
PACKAGE_NAME="firefox-conventional-comments"

# Clean up previous builds
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

# Copy source files from the src directory
cp "$SRC_DIR"/*.js "$SRC_DIR"/*.html "$SRC_DIR"/*.css "$DIST_DIR/"
cp -r "$SRC_DIR/icons" "$DIST_DIR/"

# Copy the manifest
cp "$SRC_DIR/manifest.json" "$DIST_DIR/manifest.json"

# Create the XPI file
(cd "$DIST_DIR" && zip -r "../../dist/$PACKAGE_NAME.zip" .)
mv "./dist/$PACKAGE_NAME.zip" "./dist/$PACKAGE_NAME.xpi"

echo "Package for Firefox created at: dist/$PACKAGE_NAME.xpi"