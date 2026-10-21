import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { editionPolicy } from './policy.mjs';
import { auditPackage } from './audit.mjs';
const [edition, ...args] = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i < 0 ? null : args[i + 1];
};
const policy = editionPolicy(edition);
const appId = option('--app-id'),
  depotId = option('--depot-id'),
  content = option('--content');
if (
  !/^[1-9]\d*$/.test(appId ?? '') ||
  !/^[1-9]\d*$/.test(depotId ?? '') ||
  !content
)
  throw new Error(
    'Usage: npm run steam:prepare -- demo|full --app-id REAL_APP_ID --depot-id REAL_DEPOT_ID --content PACKAGED_WINDOWS_DIRECTORY',
  );
const root = resolve(import.meta.dirname, '../..');
const directory = resolve(root, 'release/steam', edition);
const contentRoot = resolve(content);
await auditPackage(contentRoot, edition, 'win32');
const version = JSON.parse(
  await readFile(resolve(root, 'package.json')),
).version;
await mkdir(directory, { recursive: true });
const quote = (value) => {
  if (/["\r\n]/.test(value)) throw new Error('Invalid VDF value');
  return `"${value.replaceAll('\\', '/')}"`;
};
await writeFile(
  resolve(directory, `app_${appId}.vdf`),
  `"AppBuild"\n{\n  "AppID" "${appId}"\n  "Desc" "Vector Nova ${edition} ${version}"\n  "BuildOutput" "logs"\n  "ContentRoot" ${quote(relative(directory, contentRoot))}\n  "Preview" "1"\n  "Depots"\n  {\n    "${depotId}" "depot_${depotId}.vdf"\n  }\n}\n`,
);
await writeFile(
  resolve(directory, `depot_${depotId}.vdf`),
  `"DepotBuildConfig"\n{\n  "DepotID" "${depotId}"\n  "FileMapping"\n  {\n    "LocalPath" "*"\n    "DepotPath" "."\n    "recursive" "1"\n  }\n  "FileExclusion" "*.pdb"\n  "FileExclusion" "steam_appid.txt"\n}\n`,
);
await writeFile(
  resolve(directory, 'launch-options.json'),
  JSON.stringify(
    {
      appId,
      depotId,
      edition,
      os: 'windows',
      architecture: '64',
      executable: `${policy.executable}.exe`,
      arguments: '',
      workingDirectory: '',
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `SteamPipe preview configuration: ${directory}\nSet Preview to 0 only when ready to upload. No SetLive branch is configured. Configure ${policy.executable}.exe as the Windows launch executable in Steamworks.`,
);
