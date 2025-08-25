#!/bin/bash

# This script should be run from the project root directory

# Define directories
SRC_DIR="./src"
DIST_DIR="./dist/chrome"
PACKAGE_NAME="chrome-code-review-tags"

# Clean up previous builds
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

# Copy source files from the src directory
cp "$SRC_DIR"/*.js "$SRC_DIR"/*.html "$SRC_DIR"/*.css "$DIST_DIR/"
cp -r "$SRC_DIR/icons" "$DIST_DIR/"

# Copy the manifest
cp "$SRC_DIR/manifest.json" "$DIST_DIR/manifest.json"

# Create the ZIP file
(cd "$DIST_DIR" && zip -r "../../dist/$PACKAGE_NAME.zip" .)

echo "Package for Chrome created at: dist/$PACKAGE_NAME.zip"