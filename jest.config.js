module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  // @stellar/stellar-sdk pulls in @noble/hashes and @noble/curves, which
  // ship as native ESM — Jest's default transformIgnorePatterns excludes
  // all of node_modules, so those packages need to be carved out here or
  // every spec that imports the SDK (directly or transitively) fails with
  // "Cannot use import statement outside a module".
  transformIgnorePatterns: [
    'node_modules/(?!(@stellar|@noble|uint8array-extras|feaxios|smol-toml)/)',
  ],
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};
