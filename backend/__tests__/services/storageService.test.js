'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-uploads-'));
process.env.UPLOADS_DIR = tmp;

jest.mock('../../src/utils/logger', () => ({ log: jest.fn(), serializeError: (e) => e }));

const mockObjects = new Map();
const mockSend = jest.fn(async (command) => {
  const { Key, Body } = command.input;
  switch (command.constructor.name) {
    case 'PutObjectCommand': {
      const chunks = [];
      for await (const chunk of Body) chunks.push(chunk);
      mockObjects.set(Key, Buffer.concat(chunks));
      return {};
    }
    case 'GetObjectCommand': {
      if (!mockObjects.has(Key)) {
        const error = new Error('missing');
        error.name = 'NoSuchKey';
        throw error;
      }
      const { Readable } = require('stream');
      return { Body: Readable.from([mockObjects.get(Key)]) };
    }
    case 'DeleteObjectCommand':
      mockObjects.delete(Key);
      return {};
    default:
      throw new Error(`unexpected ${command.constructor.name}`);
  }
});
jest.mock('@aws-sdk/client-s3', () => {
  class Command { constructor(input) { this.input = input; } }
  return {
    S3Client: class S3Client { send(command) { return mockSend(command); } },
    PutObjectCommand: class PutObjectCommand extends Command {},
    GetObjectCommand: class GetObjectCommand extends Command {},
    DeleteObjectCommand: class DeleteObjectCommand extends Command {}
  };
});

const { toStorageKey, resolveUploadPath } = require('../../src/config/paths');
const storageService = require('../../src/services/storageService');

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('uploads paths', () => {
  it('maps current and legacy absolute paths onto the configured directory', () => {
    expect(toStorageKey(path.join(tmp, 'a.pdf'))).toBe('a.pdf');
    expect(toStorageKey('/app/uploads/policies/b.pdf')).toBe('policies/b.pdf');
    expect(resolveUploadPath('/old/host/uploads/c.txt')).toBe(path.join(tmp, 'c.txt'));
  });

  it('rejects paths outside any uploads directory', () => {
    expect(toStorageKey('/etc/passwd')).toBeNull();
    expect(toStorageKey(`${tmp}/../escape.txt`)).toBeNull();
    expect(resolveUploadPath(null)).toBeNull();
  });
});

describe('storageService', () => {
  beforeEach(() => { mockObjects.clear(); mockSend.mockClear(); });

  it('is a local no-op without a bucket and reports non-durable storage', async () => {
    storageService._configure({});
    const file = await storageService.writeFile(path.join(tmp, 'local.txt'), 'x');
    expect(fs.readFileSync(file, 'utf8')).toBe('x');
    expect(mockSend).not.toHaveBeenCalled();
    expect(storageService.describe()).toEqual(expect.objectContaining({ driver: 'local', durable: false }));
    storageService._configure({ RAILWAY_VOLUME_MOUNT_PATH: tmp });
    expect(storageService.describe().durable).toBe(true);
  });

  it('persists to the bucket and restores a file lost locally', async () => {
    storageService._configure({ S3_BUCKET: 'bucket', S3_PREFIX: 'ev' });
    const file = await storageService.writeFile(path.join(tmp, 'e.txt'), 'evidence');
    expect(mockObjects.get('ev/e.txt').toString()).toBe('evidence');
    fs.rmSync(file);
    expect(await storageService.ensureLocal(file)).toBe(file);
    expect(fs.readFileSync(file, 'utf8')).toBe('evidence');
    await storageService.remove(file);
    expect(mockObjects.has('ev/e.txt')).toBe(false);
    expect(await storageService.ensureLocal(file)).toBeNull();
  });

  it('rejects an upload with 503 and removes it when the bucket write fails', async () => {
    storageService._configure({ S3_BUCKET: 'bucket' });
    const file = path.join(tmp, 'fail.txt');
    fs.writeFileSync(file, 'x');
    mockSend.mockRejectedValueOnce(new Error('down'));
    const res = { status: jest.fn(() => res), json: jest.fn() };
    const next = jest.fn();
    await storageService.persistUploads({ file: { path: file, mimetype: 'text/plain' } }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
    expect(fs.existsSync(file)).toBe(false);
  });
});
