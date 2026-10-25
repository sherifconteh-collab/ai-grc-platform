'use strict';

// #394: with S3_BUCKET set, a file uploaded through server A is readable
// through server B, which shares no volume with A. Each "server" is its own
// copy of config/paths and storageService with its own UPLOADS_DIR; the
// bucket is an in-memory stand-in shared by both.

const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('../../src/utils/logger', () => ({ log: jest.fn(), serializeError: (e) => e }));

const mockBucket = new Map();
jest.mock('@aws-sdk/client-s3', () => {
  class Command { constructor(input) { this.input = input; } }
  return {
    S3Client: class S3Client {
      async send(command) {
        const { Key, Body } = command.input;
        switch (command.constructor.name) {
          case 'PutObjectCommand': {
            const chunks = [];
            for await (const chunk of Body) chunks.push(chunk);
            mockBucket.set(Key, Buffer.concat(chunks));
            return {};
          }
          case 'GetObjectCommand': {
            if (!mockBucket.has(Key)) { const e = new Error('missing'); e.name = 'NoSuchKey'; throw e; }
            return { Body: require('stream').Readable.from([mockBucket.get(Key)]) };
          }
          case 'DeleteObjectCommand':
            mockBucket.delete(Key);
            return {};
          default:
            throw new Error(`unexpected ${command.constructor.name}`);
        }
      }
    },
    PutObjectCommand: class PutObjectCommand extends Command {},
    GetObjectCommand: class GetObjectCommand extends Command {},
    DeleteObjectCommand: class DeleteObjectCommand extends Command {}
  };
});

const S3_ENV = { S3_BUCKET: 'shared-bucket' };
const roots = [];

function startServer(env) {
  // Stored paths end in /uploads/<key> on every host, which is how a path
  // written by one server is mapped onto another server's directory.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-server-'));
  roots.push(root);
  const dir = path.join(root, 'uploads');
  fs.mkdirSync(dir);
  process.env.UPLOADS_DIR = dir;
  let loaded;
  jest.isolateModules(() => {
    loaded = { dir, storage: require('../../src/services/storageService') };
  });
  loaded.storage._configure(env);
  return loaded;
}

afterAll(() => {
  delete process.env.UPLOADS_DIR;
  roots.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
});

describe('uploads shared through object storage', () => {
  beforeEach(() => mockBucket.clear());

  it('serves a file uploaded on server A from server B', async () => {
    const a = startServer(S3_ENV);
    const b = startServer(S3_ENV);
    expect(a.dir).not.toBe(b.dir);

    const onA = path.join(a.dir, 'policies', 'doc.pdf');
    await a.storage.writeFile(onA, 'policy body');

    // The row stores A's absolute path; B maps it by storage key.
    expect(fs.existsSync(path.join(b.dir, 'policies', 'doc.pdf'))).toBe(false);
    const onB = await b.storage.ensureLocal(onA);
    expect(onB).toBe(path.join(b.dir, 'policies', 'doc.pdf'));
    expect(fs.readFileSync(onB, 'utf8')).toBe('policy body');
  });

  it('removes the file for every server when one deletes it', async () => {
    const a = startServer(S3_ENV);
    const b = startServer(S3_ENV);
    const onA = path.join(a.dir, 'e.txt');
    await a.storage.writeFile(onA, 'x');
    await b.storage.remove(onA);
    fs.rmSync(onA, { force: true });
    expect(await a.storage.ensureLocal(onA)).toBeNull();
  });

  it('without S3_BUCKET another server cannot see the file and nothing is sent to a bucket', async () => {
    const a = startServer({});
    const b = startServer({});
    const onA = path.join(a.dir, 'local-only.txt');
    await a.storage.writeFile(onA, 'x');
    expect(mockBucket.size).toBe(0);
    expect(await b.storage.ensureLocal(onA)).toBeNull();
    expect(a.storage.describe().driver).toBe('local');
  });
});
