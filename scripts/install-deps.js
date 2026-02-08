#!/usr/bin/env node
const { execSync } = require('child_process');
const path = require('path');

try {
  const frontendPath = path.join(__dirname, '../data-explorer-frontend');
  console.log(`Installing dependencies in ${frontendPath}...`);
  execSync('npm install', { cwd: frontendPath, stdio: 'inherit' });
  console.log('Dependencies installed successfully!');
} catch (error) {
  console.error('Error installing dependencies:', error.message);
  process.exit(1);
}
