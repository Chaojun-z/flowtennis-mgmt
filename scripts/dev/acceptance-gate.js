const { spawnSync } = require('child_process');

const LAYERS = {
  local: {
    label: '本地前置',
    steps: ['npm test', 'npm run guard:finance']
  },
  staging: {
    label: 'staging 验收前',
    steps: [
      'npm run gate:local',
      'npm run staging:ensure-login-minimal:check',
      'npm run staging:ensure-browse-minimal:check'
    ]
  },
  main: {
    label: '主干收口前',
    steps: ['npm run gate:staging']
  }
};

function runCommand(command) {
  const result = spawnSync(command, {
    stdio: 'inherit',
    shell: true,
    env: process.env
  });
  return Number.isInteger(result.status) ? result.status : 1;
}

function main() {
  const layerName = String(process.argv[2] || '').trim();
  const layer = LAYERS[layerName];
  if (!layer) {
    console.error(`未知门禁层级: ${layerName || '(empty)'}`);
    console.error(`可用层级: ${Object.keys(LAYERS).join(', ')}`);
    process.exit(1);
  }

  console.log(`[acceptance-gate] layer=${layerName} label=${layer.label}`);
  for (const step of layer.steps) {
    console.log(`[acceptance-gate] run=${step}`);
    const exitCode = runCommand(step);
    if (exitCode !== 0) {
      console.error(`[acceptance-gate] failed layer=${layerName} step=${step} exit=${exitCode}`);
      process.exit(exitCode);
    }
  }
  console.log(`[acceptance-gate] passed layer=${layerName}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  LAYERS
};
