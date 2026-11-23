/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = () => ({
  type: 'clip',
  name: 'RunoutClip',
  displayName: 'Runout',
  icon: '../../assets/icon.png',
  bundleIdentifier: '.Clip',
  deploymentTarget: '17.0', // iOS 17+ App Clips may be up to 100 MB when only invoked digitally
  exportJs: true,
  entitlements: { 'com.apple.developer.associated-domains': ['appclips:runout.win'] },
});
