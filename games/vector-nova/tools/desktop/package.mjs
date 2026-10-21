import { packager } from '@electron/packager';
import { flipFuses, FuseVersion, FuseV1Options } from '@electron/fuses';
import { readFile, writeFile, cp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildDesktop, root, files } from './build.mjs';
import { createHash } from 'node:crypto';
import { auditPackage } from './audit.mjs';

const [edition, ...args] = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i < 0 ? fallback : args[i + 1];
};
const platform = option('--platform', process.platform);
const arch = option('--arch', process.arch);
if (!['darwin', 'win32'].includes(platform) || !['x64', 'arm64'].includes(arch))
  throw new Error('Supported targets: darwin/win32 and x64/arm64');
const { stage, policy, manifest } = await buildDesktop(edition);
const outputs = await packager({
  dir: stage,
  out: resolve(root, 'release', edition),
  name: policy.name,
  executableName: policy.executable,
  appBundleId: policy.id,
  appVersion: manifest.version,
  buildVersion: manifest.version,
  electronVersion: manifest.electron,
  platform,
  arch,
  asar: true,
  overwrite: true,
  prune: false,
  icon: resolve(
    root,
    'desktop/icons',
    platform === 'darwin' ? 'icon.icns' : 'icon.ico',
  ),
  appCategoryType: 'public.app-category.games',
  win32metadata: {
    CompanyName: 'VECTOR//NOVA',
    FileDescription: policy.name,
    ProductName: policy.name,
  },
});
for (const directory of outputs) {
  const binary =
    platform === 'darwin'
      ? join(directory, `${policy.name}.app`)
      : join(directory, `${policy.executable}.exe`);
  await flipFuses(binary, {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: platform === 'darwin',
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  });
  if (platform === 'darwin') {
    if (process.platform !== 'darwin')
      throw new Error(
        'Build macOS packages on macOS to sign the modified Electron runtime',
      );
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', binary], {
      stdio: 'inherit',
    });
  }
  await auditPackage(directory, edition, platform);
  // Outside the depot payload: convenient build provenance and checksums.
  await cp(
    resolve(stage, 'release-manifest.json'),
    `${directory}.manifest.json`,
  );
  const checksums = [];
  // Framework symlinks are standard inside a macOS application; hash the archive
  // and executable instead of traversing platform internals.
  const artifacts =
    platform === 'darwin'
      ? [
          join(binary, 'Contents/Resources/app.asar'),
          join(binary, 'Contents/MacOS', policy.executable),
        ]
      : await files(directory);
  for (const file of artifacts)
    checksums.push(
      `${createHash('sha256')
        .update(await readFile(file))
        .digest('hex')}  ${file.slice(directory.length + 1)}`,
    );
  await writeFile(`${directory}.sha256`, checksums.join('\n') + '\n');
  const zip = `${directory}.zip`;
  if (process.platform === 'darwin')
    execFileSync('ditto', [
      '-c',
      '-k',
      '--sequesterRsrc',
      '--keepParent',
      directory,
      zip,
    ]);
  else if (process.platform === 'win32') {
    const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
    execFileSync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Compress-Archive -LiteralPath ${quote(directory)} -DestinationPath ${quote(zip)} -Force`,
    ]);
  } else throw new Error('Create distribution ZIPs on Windows or macOS');
  await writeFile(
    `${zip}.sha256`,
    createHash('sha256')
      .update(await readFile(zip))
      .digest('hex') +
      '  ' +
      zip.split(/[\\/]/).at(-1) +
      '\n',
  );
  console.log(`Packaged ${edition} ${platform}/${arch}: ${directory}`);
}
