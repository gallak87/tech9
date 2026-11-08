import { chromium } from 'playwright';

export function verificationBrowserOptions(
  { args = [], headless = true, defaultChannel = 'chrome' } = {},
  env = process.env,
) {
  const channel = env.VN_BROWSER_CHANNEL || defaultChannel;
  return {
    headless,
    args: [...new Set(['--mute-audio', ...args])],
    ...(env.VN_BROWSER_PATH
      ? { executablePath: env.VN_BROWSER_PATH }
      : channel
        ? { channel }
        : {}),
  };
}

export const launchVerificationBrowser = (options) =>
  chromium.launch(verificationBrowserOptions(options));

export function collectPageErrors(page, errors = [], onError) {
  page.on('pageerror', (error) => {
    errors.push(error.message);
    onError?.(error.message);
  });
  return errors;
}
